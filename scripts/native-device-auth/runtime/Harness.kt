package probe
import android.app.Activity
import android.content.Intent
import android.os.*
import android.hardware.biometrics.BiometricPrompt
import android.hardware.fingerprint.FingerprintManager
import expo.modules.localauthentication.*
import expo.modules.kotlin.Promise
object Fake {
 var launchThrows=false;var credentialThrows=false;var deviceSecure=true;var hasFingerprint=true
 val launched=mutableListOf<Intent>();val credentials=mutableListOf<Pair<Activity,Int>>();val closedCredentials=mutableListOf<Pair<Activity,Int>>()
 val prompts=mutableListOf<BiometricPrompt>();val fingerprints=mutableListOf<FingerprintManager>()
 fun reset(){launchThrows=false;credentialThrows=false;deviceSecure=true;hasFingerprint=true;launched.clear();credentials.clear();closedCredentials.clear();prompts.clear();fingerprints.clear()}
}
class P:Promise {val values=mutableListOf<Any?>();override fun resolve(value:Any?){values.add(value)};fun success()=(values.single() as Bundle).getBoolean("success");fun error()=(values.single() as Bundle).getString("error")}
internal fun launch(owner:Any=Any(),p:P=P(),options:AuthOptions=AuthOptions()):Triple<Any,P,DeviceAuthenticationActivity> {
 DeviceAuthenticationRequests.launch(Activity(),owner,options,p)
 val host=DeviceAuthenticationActivity();host.intent=Fake.launched.last();host.onCreate(null);host.onResume();return Triple(owner,p,host)
}
var checks=0
fun test(name:String,run:()->Unit){Fake.reset();run();checks++;println("PASS $name")}
fun main(){
 for(api in listOf(26,27,28,30))test("API $api success belongs to host, resolves after destroy"){
  Build.VERSION.SDK_INT=api;val(_,p,h)=launch()
  if(api<28)Fake.fingerprints.last().callback!!.onAuthenticationSucceeded(FingerprintManager.AuthenticationResult()) else Fake.prompts.last().callback!!.onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult(null))
  check(h.isFinishing);check(p.values.isEmpty());h.onDestroy();check(p.success())
 }
 test("cancel before onCreate keeps slot until exact host destruction"){
  Build.VERSION.SDK_INT=28;val owner=Any();val p=P();val ack=P();DeviceAuthenticationRequests.launch(Activity(),owner,AuthOptions(),p)
  val intent=Fake.launched.last();DeviceAuthenticationRequests.cancel(owner,ack);check(ack.values.isEmpty())
  val rejected=P();DeviceAuthenticationRequests.launch(Activity(),Any(),AuthOptions(),rejected);check(rejected.error()=="app_cancel")
  val h=DeviceAuthenticationActivity();h.intent=intent;h.onCreate(null);check(h.isFinishing);h.onDestroy();check(p.error()=="app_cancel");check(ack.values.size==1)
 }
 for(api in listOf(26,28,30))test("API $api cancel A then late A success/error cannot resolve B"){
  Build.VERSION.SDK_INT=api;val(owner,pa,a)=launch();val fp=Fake.fingerprints.lastOrNull();val old=Fake.prompts.lastOrNull();val ack=P()
  DeviceAuthenticationRequests.cancel(owner,ack);check(ack.values.isEmpty());a.onDestroy();check(ack.values.size==1)
  val(_,pb,b)=launch();check(a.manager!==b.manager)
  if(api<28){fp!!.callback!!.onAuthenticationSucceeded(FingerprintManager.AuthenticationResult());fp.callback!!.onAuthenticationError(5,"old")}else{old!!.callback!!.onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult(null));old.callback!!.onAuthenticationError(5,"old")}
  check(pb.values.isEmpty());check(pa.error()=="app_cancel")
  if(api<28)Fake.fingerprints.last().callback!!.onAuthenticationSucceeded(FingerprintManager.AuthenticationResult())else Fake.prompts.last().callback!!.onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult(null))
  b.onDestroy();check(pb.success())
 }
 test("original credential host owns results; old/duplicate result cannot unlock B"){
  Build.VERSION.SDK_INT=28;val(owner,pa,a)=launch();Fake.prompts.last().callback!!.onAuthenticationError(11,"unavailable");check(Fake.credentials.size==1)
  DeviceAuthenticationRequests.cancel(owner);check(Fake.closedCredentials.any{it.first===a});a.onDestroy()
  val(_,pb,b)=launch();Fake.prompts.last().negative!!.invoke();check(Fake.credentials.size==2)
  a.onActivityResult(1,Activity.RESULT_OK,null);a.onActivityResult(1,Activity.RESULT_OK,null);check(pb.values.isEmpty())
  b.onActivityResult(1,Activity.RESULT_OK,null);b.onDestroy();check(pb.success());check(pa.error()=="app_cancel")
 }
 test("old module owner cannot cancel fresh owner"){
  Build.VERSION.SDK_INT=30;val(old,_,a)=launch();DeviceAuthenticationRequests.cancel(old);a.onDestroy()
  val(_,p,b)=launch();val ack=P();DeviceAuthenticationRequests.cancel(old,ack);check(!b.isFinishing);check(ack.values.size==1)
  b.onBackPressed();b.onDestroy();check(p.error()=="user_cancel")
 }
 test("launcher exception releases registry with failure"){
  Fake.launchThrows=true;val p=P();DeviceAuthenticationRequests.launch(Activity(),Any(),AuthOptions(),p);check(p.error()=="not_available")
  Fake.launchThrows=false;val(_,q,h)=launch();h.onBackPressed();h.onDestroy();check(!q.success())
 }
 test("recreation cancels rather than adopting or restarting old authentication"){
  Build.VERSION.SDK_INT=30;val(_,p,h)=launch();val intent=h.intent;h.onDestroy();check(p.error()=="app_cancel")
  val restored=DeviceAuthenticationActivity();restored.intent=intent;restored.onCreate(Bundle());restored.onResume();check(restored.isFinishing);check(Fake.prompts.size==1);restored.onDestroy()
 }
 test("API26 PIN-only works; no enrollment does not deny credential"){
  Build.VERSION.SDK_INT=26;Fake.hasFingerprint=false;val(_,p,h)=launch();check(Fake.credentials.size==1);h.onStop();check(!h.isFinishing);h.onActivityResult(1,Activity.RESULT_OK,null);h.onDestroy();check(p.success())
 }
 test("API29 crypto setup failure does not downgrade to no-crypto prompt"){
  Build.VERSION.SDK_INT=29;val(_,p,h)=launch();check(Fake.prompts.isEmpty());check(Fake.credentials.size==1);h.onActivityResult(1,Activity.RESULT_OK,null);h.onDestroy();check(p.success())
 }
 test("credential launcher exception settles fail closed"){
  Build.VERSION.SDK_INT=28;Fake.credentialThrows=true;val(_,p,h)=launch();Fake.prompts.last().negative!!.invoke();check(h.isFinishing);h.onDestroy();check(p.error()=="not_available")
 }
 test("no device lock cannot succeed"){
  Build.VERSION.SDK_INT=30;Fake.deviceSecure=false;val(_,p,h)=launch();check(h.isFinishing);h.onDestroy();check(p.error()=="not_enrolled")
 }
 test("API30 strong mask and explicit no fallback are preserved"){
  Build.VERSION.SDK_INT=30;val(_,p,h)=launch(options=AuthOptions().apply{disableDeviceFallback=true});check(Fake.prompts.last().allowed==15);Fake.prompts.last().negative!!.invoke();check(Fake.credentials.isEmpty());h.onDestroy();check(p.error()=="user_cancel")
 }
 test("API26 background fingerprint is canceled"){
  Build.VERSION.SDK_INT=26;val(_,p,h)=launch();h.onStop();Fake.fingerprints.last().callback!!.onAuthenticationSucceeded(FingerprintManager.AuthenticationResult());h.onDestroy();check(p.error()=="app_cancel")
 }
 test("revoke success pending host destruction before result delivery"){
  Build.VERSION.SDK_INT=30;val(owner,p,h)=launch();check(Fake.prompts.last().allowed==32783);Fake.prompts.last().callback!!.onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult(null));DeviceAuthenticationRequests.cancel(owner);h.onDestroy();check(p.error()=="app_cancel")
 }
 println("$checks actual Kotlin request/activity checks passed with Android runtime adapters, not a phone/Keystore test")
}
