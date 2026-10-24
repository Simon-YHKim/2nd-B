package android.hardware.fingerprint
import android.os.*
import probe.Fake
class FingerprintManager {
 val isHardwareDetected get()=Fake.hasFingerprint
 fun hasEnrolledFingerprints()=Fake.hasFingerprint
 var callback:AuthenticationCallback?=null
 fun authenticate(crypto:Any?,signal:CancellationSignal,flags:Int,callback:AuthenticationCallback,handler:Handler?){this.callback=callback;Fake.fingerprints.add(this)}
 open class AuthenticationCallback {open fun onAuthenticationSucceeded(result:AuthenticationResult){};open fun onAuthenticationError(code:Int,message:CharSequence){};open fun onAuthenticationHelp(code:Int,message:CharSequence){}}
 class AuthenticationResult
}
