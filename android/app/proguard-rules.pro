# Used only if minification is ever turned on (Section 7.4).
-keep class com.sun.jna.** { *; }
-keep class * implements com.sun.jna.** { *; }
-keep class com.goterl.** { *; }
-dontwarn java.awt.**
-keepattributes *Annotation*, InnerClasses, Signature
-keep,includedescriptorclasses class app.satya.**$$serializer { *; }
-keepclassmembers class app.satya.** { *** Companion; }
-keepclasseswithmembers class app.satya.** { kotlinx.serialization.KSerializer serializer(...); }
