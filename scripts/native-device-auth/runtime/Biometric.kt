package android.hardware.biometrics
import android.content.Context
import android.hardware.fingerprint.FingerprintManager
import android.os.*
import java.util.concurrent.Executor
import javax.crypto.Cipher
import probe.Fake
class BiometricPrompt(private val context:Context,val allowed:Int,val negative:(()->Unit)?) {
 var callback:AuthenticationCallback?=null;var suppliedCrypto:CryptoObject?=null
 class Builder(private val context:Context){var allowed=0;var negative:(()->Unit)?=null;fun setTitle(t:CharSequence)=this;fun setSubtitle(t:CharSequence)=this;fun setDescription(t:CharSequence)=this;fun setConfirmationRequired(b:Boolean)=this;fun setAllowedAuthenticators(a:Int):Builder{allowed=a;return this};fun setNegativeButton(t:CharSequence,e:Executor,listener:(Any?,Int)->Unit):Builder {negative={e.execute{listener(null,0)}};return this};fun build()=BiometricPrompt(context,allowed,negative)}
 fun authenticate(signal:CancellationSignal,executor:Executor,callback:AuthenticationCallback){this.callback=callback;Fake.prompts.add(this);if(Build.VERSION.SDK_INT==28)context.manager.authenticate(null,signal,0,object:FingerprintManager.AuthenticationCallback(){override fun onAuthenticationSucceeded(result:FingerprintManager.AuthenticationResult){executor.execute{this@BiometricPrompt.callback?.onAuthenticationSucceeded(AuthenticationResult(null))}};override fun onAuthenticationError(c:Int,m:CharSequence){executor.execute{this@BiometricPrompt.callback?.onAuthenticationError(c,m)}}},null)}
 fun authenticate(crypto:CryptoObject,signal:CancellationSignal,e:Executor,c:AuthenticationCallback){suppliedCrypto=crypto;authenticate(signal,e,c)}
 class CryptoObject(val cipher:Cipher)
 class AuthenticationResult(val cryptoObject:CryptoObject?)
 open class AuthenticationCallback {open fun onAuthenticationSucceeded(result:AuthenticationResult){};open fun onAuthenticationError(code:Int,message:CharSequence){};open fun onAuthenticationHelp(code:Int,message:CharSequence){}}
}
