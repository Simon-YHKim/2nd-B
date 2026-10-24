package android.app
import android.content.*
import android.os.Bundle
import android.view.Window
import probe.Fake
open class Activity:Context() {
 companion object {const val RESULT_OK=-1}
 var intent:Intent?=null;val window=Window();var isFinishing=false;var isDestroyed=false
 open fun onCreate(saved:Bundle?){};open fun onResume(){};open fun onStop(){};open fun onDestroy(){isDestroyed=true};open fun onBackPressed(){}
 open fun onActivityResult(code:Int,result:Int,data:Intent?){}
 fun hasWindowFocus()=true
 fun startActivity(intent:Intent){if(Fake.launchThrows)throw IllegalStateException();Fake.launched.add(intent)}
 fun startActivityForResult(intent:Intent,code:Int){if(Fake.credentialThrows)throw IllegalStateException();Fake.credentials.add(this to code)}
 fun finishActivity(code:Int){Fake.closedCredentials.add(this to code)}
 fun finish(){isFinishing=true};fun setContentView(view:Any){}
}
class KeyguardManager {val isDeviceSecure get()=Fake.deviceSecure;fun createConfirmDeviceCredentialIntent(title:CharSequence,description:CharSequence?):Intent?=if(Fake.deviceSecure)Intent()else null}
