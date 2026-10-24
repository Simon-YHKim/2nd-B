package android.content
import android.app.KeyguardManager
import android.hardware.fingerprint.FingerprintManager
open class Context {
 companion object {const val KEYGUARD_SERVICE="keyguard"}
 val manager=FingerprintManager()
 val resources=Resources()
 fun getSystemService(name:String):Any=KeyguardManager()
 fun <T> getSystemService(clazz:Class<T>):T?=if(clazz==FingerprintManager::class.java)clazz.cast(manager) else null
 fun getString(id:Int)="Cancel"
}
class Resources {val displayMetrics=Metrics()};class Metrics {val density=1f}
class Intent() {constructor(context:Context,clazz:Class<*>):this();private val extras=mutableMapOf<String,String>();fun putExtra(k:String,v:String):Intent {extras[k]=v;return this};fun getStringExtra(k:String)=extras[k]}
