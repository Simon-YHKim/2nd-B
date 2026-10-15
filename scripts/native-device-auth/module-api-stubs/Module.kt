package expo.modules.kotlin.modules
import expo.modules.kotlin.AppContext
abstract class Module {val appContext=AppContext();abstract fun definition():Definition}
class Definition
class Def {fun runOnQueue(queue:Any)=this}
class Builder {
 fun Name(name:String){}
 fun <T> AsyncFunction(name:String,body:()->T)=Def()
 fun <R,A> AsyncFunction(name:String,body:(A)->R)=Def()
 fun <R,A,B> AsyncFunction(name:String,body:(A,B)->R)=Def()
 fun OnDestroy(body:()->Unit){}
}
fun Module.ModuleDefinition(body:Builder.()->Unit):Definition {Builder().body();return Definition()}
