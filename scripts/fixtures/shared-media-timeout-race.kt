// JVM harness: __TAKE__ is replaced with the exact generated native take body.
// These controlled scheduling tests do not emulate an Android provider/codec.
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import java.io.InputStream

class Context
interface Promise { fun reject(code: String, message: String); fun resolve(result: String) }
class Entry(val kind: String) {
  var claimed = false
  val cancelled = AtomicBoolean(false)
  val input = AtomicReference<InputStream?>(null)
}
class Handler {
  var task: Runnable? = null
  fun postDelayed(runnable: Runnable, delay: Long) { check(delay > 0); task = runnable }
  fun removeCallbacks(runnable: Runnable) { if (task === runnable) task = null }
}
class Workers {
  var task: (() -> Unit)? = null
  fun execute(job: () -> Unit) { task = job }
}
object Replay {
  val lock = Any()
  val entries = mutableMapOf<String, Entry>()
  val handler = Handler()
  val workers = Workers()
  const val COPY_TIMEOUT_MS = 15_000L
  var cacheExists = false
  var resolved: String? = null
  val rejections = mutableListOf<String>()
  var afterCheck: (() -> Unit)? = null
  fun expired(entry: Entry) = false
  fun prepare(context: Context, entry: Entry): String { cacheExists = true; return "file:///owned.input" }
  fun checkActive(entry: Entry) { check(!entry.cancelled.get()); afterCheck?.invoke() }
  fun discard(token: String) { entries.remove(token)?.cancelled?.set(true); cacheExists = false }
  fun reset() {
    entries.clear(); entries["token"] = Entry("audio")
    cacheExists = false; resolved = null; rejections.clear(); afterCheck = null
    handler.task = null; workers.task = null
  }
  fun promise(duringResolve: () -> Unit = {}) = object : Promise {
    override fun reject(code: String, message: String) { rejections.add(code) }
    override fun resolve(result: String) { duringResolve(); resolved = result }
  }
__TAKE__
}

fun main() {
  Replay.reset()
  Replay.take(Context(), "token", "audio", Replay.promise { Replay.handler.task!!.run() })
  Replay.workers.task!!()
  check(Replay.resolved != null && Replay.rejections.isEmpty() && Replay.cacheExists) {
    "A losing timeout must not delete the winner's cache"
  }

  Replay.reset()
  Replay.take(Context(), "token", "audio", Replay.promise())
  Replay.handler.task!!.run()
  Replay.workers.task!!() // a provider returns after the timeout already won
  check(Replay.resolved == null && Replay.rejections == listOf("share_timeout") && !Replay.cacheExists) {
    "A late worker must discard its partial copy after timeout"
  }

  Replay.reset()
  Replay.take(Context(), "token", "audio", Replay.promise())
  Replay.afterCheck = { Replay.handler.task!!.run() } // timeout between active check and worker CAS
  Replay.workers.task!!()
  check(Replay.resolved == null && Replay.rejections == listOf("share_timeout") && !Replay.cacheExists) {
    "The terminal CAS must have exactly one owner"
  }
  println("PASS: actual native take body, success/timeout/late-copy races (3 schedules)")
}
