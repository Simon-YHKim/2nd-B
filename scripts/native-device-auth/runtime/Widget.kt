package android.widget
import android.content.Context
open class TextView(context:Context){var text:CharSequence?=null;var gravity=0;var textSize=0f;fun setTextColor(color:Int){};fun setText(id:Int){}}
class Button(context:Context):TextView(context){var click:(()->Unit)?=null;fun setOnClickListener(listener:(Any?)->Unit){click={listener(null)}}}
class LinearLayout(context:Context){companion object{const val VERTICAL=1};var orientation=0;var gravity=0;fun setBackgroundColor(color:Int){};fun setPadding(a:Int,b:Int,c:Int,d:Int){};fun addView(v:Any?) {}}
