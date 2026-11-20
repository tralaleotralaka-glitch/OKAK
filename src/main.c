#ifdef __ANDROID__
#include <jni.h>

JNIEXPORT jstring JNICALL
Java_com_example_armv7starter_MainActivity_message(JNIEnv *env, jobject activity)
{
    (void)activity;
    return (*env)->NewStringUTF(env, "Hello from the ARMv7 Android app!");
}
#else
#include <stdio.h>

int main(void)
{
    puts("Hello from the ARMv7 starter project!");
    return 0;
}
#endif
