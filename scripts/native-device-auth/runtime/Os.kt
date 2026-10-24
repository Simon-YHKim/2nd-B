package android.os
class Bundle { private val data=mutableMapOf<String,Any?>(); fun putBoolean(k:String,v:Boolean){data[k]=v};fun putString(k:String,v:String){data[k]=v};fun getBoolean(k:String)=data[k] as? Boolean?:false;fun getString(k:String)=data[k] as? String }
object Build { object VERSION { var SDK_INT=30 } }
class Looper { companion object {private val main=Looper();fun myLooper()=main;fun getMainLooper()=main} }
class Handler(looper:Looper) {fun post(r:Runnable):Boolean {r.run();return true}}
class CancellationSignal { var canceled=false;fun cancel(){canceled=true} }
