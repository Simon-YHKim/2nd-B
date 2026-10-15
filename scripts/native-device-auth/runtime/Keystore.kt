package android.security.keystore
import java.security.spec.AlgorithmParameterSpec
class KeyGenParameterSpec:AlgorithmParameterSpec {class Builder(alias:String,purpose:Int){fun setBlockModes(vararg modes:String)=this;fun setEncryptionPaddings(vararg pads:String)=this;fun setUserAuthenticationRequired(required:Boolean)=this;fun setUserAuthenticationValidityDurationSeconds(seconds:Int)=this;fun build()=KeyGenParameterSpec()}}
object KeyProperties {const val KEY_ALGORITHM_AES="AES";const val PURPOSE_ENCRYPT=1;const val BLOCK_MODE_CBC="CBC";const val ENCRYPTION_PADDING_PKCS7="PKCS7Padding"}
