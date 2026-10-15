package __PACKAGE_NAME__

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Matrix
import android.media.ExifInterface
import android.graphics.BitmapFactory
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Base64
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import java.io.File
import java.io.FilterOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.util.Locale
import java.util.UUID
import java.util.concurrent.SynchronousQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

// Template copied by withAndroidShareTarget during prebuild. Never read a URI
// supplied by JS: only an actual SEND intent can create a short-lived handle.
internal object ShareMediaIntent {
  private const val MAX_AUDIO = __MAX_AUDIO__L
  private const val MAX_IMAGE = __MAX_IMAGE__L
  private const val MAX_PREPARED = __MAX_PREPARED__L
  private const val MAX_PIXELS = __MAX_PIXELS__L
  private const val MAX_SIDE = __MAX_SIDE__
  private const val TTL_MS = __TTL_MS__L
  private const val COPY_TIMEOUT_MS = __COPY_TIMEOUT_MS__L
  private val lock = Any()
  private val entries = LinkedHashMap<String, Entry>()
  private val handler = Handler(Looper.getMainLooper())
  // A hostile provider may block while opening a descriptor. Bound threads and
  // queue; timeouts reject promptly and late returns only remove their files.
  private val workers = ThreadPoolExecutor(2, 2, 30L, TimeUnit.SECONDS, SynchronousQueue<Runnable>())

  private class Entry(val uri: Uri, val declared: String, val kind: String) {
    val token: String = UUID.randomUUID().toString()
    val created: Long = SystemClock.elapsedRealtime()
    val cancelled = AtomicBoolean(false)
    val input = AtomicReference<InputStream?>(null)
    var claimed = false
    var source: File? = null
    var prepared: File? = null
  }

  fun route(context: Context, intent: Intent?, restoring: Boolean): Boolean {
    if (intent == null || restoring || (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return false
    if (intent.action != Intent.ACTION_SEND && intent.action != Intent.ACTION_SEND_MULTIPLE) return false
    val declared = normalizeMime(intent.type ?: return false)
    val kind = when {
      declared.startsWith("image/") -> "image"
      declared.startsWith("audio/") -> "audio"
      else -> return false
    }
    var error: String? = null
    var entry: Entry? = null
    try {
      val streams = LinkedHashSet<Uri>()
      @Suppress("DEPRECATION")
      val extra = if (intent.action == Intent.ACTION_SEND_MULTIPLE) null else intent.getParcelableExtra<android.os.Parcelable>(Intent.EXTRA_STREAM)
      if (extra != null) {
        if (extra !is Uri) throw IllegalArgumentException()
        streams.add(extra)
      }
      val clip = intent.clipData
      if ((clip?.itemCount ?: 0) > 1 || intent.action == Intent.ACTION_SEND_MULTIPLE) {
        error = "multiple"
      } else {
        if (clip != null && clip.itemCount == 1) clip.getItemAt(0).uri?.let { streams.add(it) }
        if (streams.size != 1) error = if (streams.size > 1) "multiple" else "unreadable"
        val uri = streams.firstOrNull()
        if (error == null && (uri == null || uri.toString().length > 4096 || uri.scheme != "content" ||
            uri.authority.isNullOrBlank() || uri.authority!!.startsWith(context.packageName) ||
            (intent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION) == 0)) error = "unreadable"
        if (error == null && uri != null) entry = Entry(uri, declared, kind)
      }
    } catch (_: RuntimeException) {
      error = "unreadable"
    }
    val link = Uri.Builder().scheme("__SCHEME__").authority("__HOST__").appendQueryParameter("kind", kind)
    synchronized(lock) {
      // One unclaimed delivery, no sign-in/recovery queue. Claimed copies stay
      // owned by their consumer until it releases them, capped at four total.
      entries.values.filter { !it.claimed }.toList().forEach { cancelLocked(it) }
      if (entry != null && entries.size < 4) {
        entries[entry!!.token] = entry!!
        link.appendQueryParameter("media", entry!!.token)
        val token = entry!!.token
        handler.postDelayed({ synchronized(lock) { entries[token]?.takeIf { !it.claimed }?.let { cancelLocked(it) } } }, TTL_MS)
      } else link.appendQueryParameter("error", error ?: "unavailable")
    }
    intent.action = Intent.ACTION_VIEW
    intent.data = link.build()
    intent.removeExtra(Intent.EXTRA_STREAM)
    intent.removeExtra(Intent.EXTRA_TEXT)
    intent.removeExtra(Intent.EXTRA_SUBJECT)
    intent.clipData = null
    return true
  }

  fun take(context: Context, token: String, kind: String, promise: Promise) {
    val entry = synchronized(lock) {
      entries[token]?.takeIf { !it.claimed && !it.cancelled.get() && !expired(it) && it.kind == kind }
        ?.also { it.claimed = true }
    }
    if (entry == null) { promise.reject("share_unavailable", "Shared file is no longer available"); return }
    val settled = AtomicBoolean(false)
    val timeout = Runnable {
      if (settled.compareAndSet(false, true)) {
        discard(token)
        promise.reject("share_timeout", "Shared file could not be opened")
      }
    }
    handler.postDelayed(timeout, COPY_TIMEOUT_MS)
    try {
      workers.execute {
        var success = false
        try {
          val result = prepare(context, entry)
          checkActive(entry)
          if (settled.compareAndSet(false, true)) { promise.resolve(result); success = true }
        } catch (_: Exception) {
          if (settled.compareAndSet(false, true)) promise.reject("share_unreadable", "Shared file could not be opened")
        } finally {
          handler.removeCallbacks(timeout)
          entry.input.getAndSet(null)?.runCatching { close() }
          if (!success) discard(token)
        }
      }
    } catch (_: RuntimeException) {
      handler.removeCallbacks(timeout)
      discard(token)
      if (settled.compareAndSet(false, true)) promise.reject("share_busy", "Shared file could not be opened")
    }
  }

  fun discard(token: String) = synchronized(lock) { entries[token]?.let { cancelLocked(it) }; Unit }
  fun discardAll() = synchronized(lock) { entries.values.toList().forEach { cancelLocked(it) }; Unit }
  private fun expired(entry: Entry) = SystemClock.elapsedRealtime() - entry.created >= TTL_MS
  private fun checkActive(entry: Entry) { if (entry.cancelled.get() || expired(entry)) throw IllegalStateException() }
  private fun cancelLocked(entry: Entry) {
    entry.cancelled.set(true)
    entries.remove(entry.token)
    entry.input.getAndSet(null)?.runCatching { close() }
    entry.source?.delete()
    entry.prepared?.delete()
  }

  fun cleanOrphans(context: Context) {
    try { workers.execute { runCatching { cacheRoot(context) } } } catch (_: RuntimeException) { /* next take retries */ }
  }

  private fun cacheRoot(context: Context): File {
    val root = File(context.cacheDir, "pola-shared-media")
    if (!root.exists() && !root.mkdirs() && !root.isDirectory) throw IllegalStateException()
    if (root.canonicalFile.parentFile != context.cacheDir.canonicalFile) throw IllegalStateException()
    // Only this fixed private directory contains these generated, one-use
    // files. Remove process-death leftovers, never external provider originals.
    synchronized(lock) {
      val live = entries.values.flatMap { listOfNotNull(it.source?.path, it.prepared?.path) }.toSet()
      root.listFiles()?.filter { it.isFile && it.path !in live && Regex("[a-f0-9-]{36}\\.(input|jpg)").matches(it.name) }
        ?.forEach { if (it.canonicalFile.parentFile == root.canonicalFile) it.delete() }
    }
    return root
  }

  private fun prepare(context: Context, entry: Entry): com.facebook.react.bridge.WritableMap {
    checkActive(entry)
    val root = cacheRoot(context)
    val source = File(root, "${entry.token}.input")
    synchronized(lock) { checkActive(entry); entry.source = source }
    var total = 0L
    val limit = if (entry.kind == "audio") MAX_AUDIO else MAX_IMAGE
    try {
      // The platform stream owns a file descriptor; cancellation closes that
      // descriptor, never arbitrary code supplied by another app.
      val asset = context.contentResolver.openAssetFileDescriptor(entry.uri, "r") ?: throw IllegalStateException()
      val input = try { asset.createInputStream() } catch (error: Exception) { asset.close(); throw error }
      entry.input.set(input)
      checkActive(entry)
      input.use { incoming ->
        source.outputStream().use { out ->
          val buffer = ByteArray(16 * 1024)
          while (true) {
            checkActive(entry)
            val read = incoming.read(buffer)
            if (read < 0) break
            total += read
            if (total > limit) throw IllegalArgumentException()
            out.write(buffer, 0, read)
          }
        }
      }
      entry.input.set(null)
      if (total <= 0) throw IllegalArgumentException()
      checkActive(entry)
      val output: File
      val mime: String
      if (entry.kind == "image") {
        output = prepareImage(root, source, entry)
        mime = "image/jpeg"
        source.delete()
      } else {
        mime = validateAudio(source, entry)
        output = source
      }
      checkActive(entry)
      return Arguments.createMap().apply {
        putString("token", entry.token)
        putString("kind", entry.kind)
        putString("uri", Uri.fromFile(output).toString())
        putString("mimeType", mime)
        putDouble("size", output.length().toDouble())
        if (entry.kind == "image") putString("base64", Base64.encodeToString(output.readBytes(), Base64.NO_WRAP))
      }
    } finally {
      if (entry.cancelled.get()) { source.delete(); entry.prepared?.delete() }
    }
  }

  private fun normalizeMime(mime: String) = mime.substringBefore(';').trim().lowercase(Locale.ROOT)
    .let { when (it) { "image/jpg", "image/pjpeg" -> "image/jpeg"; "image/x-png" -> "image/png"; "audio/m4a", "audio/x-m4a" -> "audio/mp4"; "audio/x-wav" -> "audio/wav"; else -> it } }

  private fun prepareImage(root: File, source: File, entry: Entry): File {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(source.path, bounds)
    val actual = normalizeMime(bounds.outMimeType ?: throw IllegalArgumentException())
    if (actual !in setOf("image/jpeg", "image/png", "image/webp", "image/heic", "image/heif")) throw IllegalArgumentException()
    if (entry.declared != "image/*" && entry.declared != actual &&
      !(entry.declared in setOf("image/heic", "image/heif") && actual in setOf("image/heic", "image/heif"))) throw IllegalArgumentException()
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outWidth.toLong() * bounds.outHeight > MAX_PIXELS) throw IllegalArgumentException()
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / sample > MAX_SIDE) sample *= 2
    checkActive(entry)
    val bitmap = BitmapFactory.decodeFile(source.path, BitmapFactory.Options().apply { inSampleSize = sample }) ?: throw IllegalArgumentException()
    var oriented = bitmap
    try {
      val orientation = ExifInterface(source.path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
      val matrix = Matrix().apply {
        when (orientation) {
          ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> setScale(-1f, 1f)
          ExifInterface.ORIENTATION_ROTATE_180 -> setRotate(180f)
          ExifInterface.ORIENTATION_FLIP_VERTICAL -> setScale(1f, -1f)
          ExifInterface.ORIENTATION_TRANSPOSE -> { setRotate(90f); postScale(-1f, 1f) }
          ExifInterface.ORIENTATION_ROTATE_90 -> setRotate(90f)
          ExifInterface.ORIENTATION_TRANSVERSE -> { setRotate(-90f); postScale(-1f, 1f) }
          ExifInterface.ORIENTATION_ROTATE_270 -> setRotate(-90f)
        }
      }
      if (!matrix.isIdentity) oriented = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
      checkActive(entry)
      val target = File(root, "${entry.token}.jpg")
      synchronized(lock) { checkActive(entry); entry.prepared = target }
      target.outputStream().use { raw ->
        LimitedOutput(raw, MAX_PREPARED).use { bounded ->
          if (!oriented.compress(Bitmap.CompressFormat.JPEG, 75, bounded)) throw IllegalArgumentException()
        }
      }
      checkActive(entry)
      return target
    } finally { if (oriented !== bitmap) oriented.recycle(); bitmap.recycle() }
  }

  private class LimitedOutput(out: OutputStream, private val limit: Long) : FilterOutputStream(out) {
    private var count = 0L
    override fun write(value: Int) { if (++count > limit) throw IllegalArgumentException(); out.write(value) }
    override fun write(bytes: ByteArray, offset: Int, length: Int) {
      count += length
      if (count > limit) throw IllegalArgumentException()
      out.write(bytes, offset, length)
    }
  }

  private fun validateAudio(file: File, entry: Entry): String {
    val header = ByteArray(16)
    val length = file.inputStream().use { it.read(header) }
    fun ascii(start: Int, count: Int) = if (length >= start + count) String(header, start, count, Charsets.US_ASCII) else ""
    val actual = when {
      ascii(0, 4) == "RIFF" && ascii(8, 4) == "WAVE" -> "audio/wav"
      ascii(0, 4) == "OggS" -> "audio/ogg"
      ascii(4, 4) == "ftyp" -> if (ascii(8, 3) == "3gp") "audio/3gpp" else "audio/mp4"
      length >= 4 && header.take(4).map { it.toInt() and 255 } == listOf(0x1a, 0x45, 0xdf, 0xa3) -> "audio/webm"
      length >= 2 && (header[0].toInt() and 255) == 255 && (header[1].toInt() and 0xf6) == 0xf0 -> "audio/aac"
      ascii(0, 3) == "ID3" || (length >= 2 && (header[0].toInt() and 255) == 255 && (header[1].toInt() and 0xe0) == 0xe0) -> "audio/mpeg"
      else -> throw IllegalArgumentException()
    }
    if (entry.declared != "audio/*" && entry.declared != actual) throw IllegalArgumentException()
    val extractor = MediaExtractor()
    try {
      extractor.setDataSource(file.path)
      if (extractor.trackCount !in 1..16) throw IllegalArgumentException()
      for (index in 0 until extractor.trackCount) {
        checkActive(entry)
        val trackMime = extractor.getTrackFormat(index).getString(MediaFormat.KEY_MIME) ?: throw IllegalArgumentException()
        if (!trackMime.startsWith("audio/")) throw IllegalArgumentException()
      }
    } finally { extractor.release() }
    return actual
  }
}

internal class SharedMediaModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  init { ShareMediaIntent.cleanOrphans(context) }
  override fun getName() = "__MODULE__"
  @ReactMethod fun take(token: String, kind: String, promise: Promise) = ShareMediaIntent.take(reactApplicationContext, token, kind, promise)
  @ReactMethod fun discard(token: String) { ShareMediaIntent.discard(token) }
  @ReactMethod fun discardAll() { ShareMediaIntent.discardAll() }
  override fun invalidate() { ShareMediaIntent.discardAll(); super.invalidate() }
}

class ShareMediaPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(SharedMediaModule(reactContext))
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
