package expo.modules.kotlin.exception
object Exceptions { class MissingActivity:RuntimeException();class ReactContextLost:RuntimeException() }
class UnexpectedException(message:String,cause:Throwable):RuntimeException(message,cause)
