# Minification is off for this build, but keep the JNI entry points pinned in
# case it is ever turned on: their names are resolved from native code.
-keepclasseswithmembernames class * {
    native <methods>;
}
-keep class com.liftlog.airplay.crypto.FairPlay { *; }
