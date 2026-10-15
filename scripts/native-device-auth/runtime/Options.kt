package expo.modules.localauthentication
internal enum class BiometricsSecurityLevel { WEAK, STRONG }
internal class AuthOptions {var promptMessage="Authenticate";var promptSubtitle:String?=null;var promptDescription:String?=null;var cancelLabel:String?="Device PIN";var disableDeviceFallback=false;var requireConfirmation=true;var biometricsSecurityLevel=BiometricsSecurityLevel.STRONG}
