/*
 * JNI bridge to the vendored FairPlay SAP ("playfair") implementation.
 *
 * Only the two operations Kotlin cannot reasonably do itself live here:
 *   - the fp-setup phase-1 reply table lookup, and
 *   - the AES key unwrap (playfair_decrypt).
 * The phase-2 reply is a trivial header + echo and is built in Kotlin.
 */

#include <jni.h>
#include <string.h>

#include "playfair/playfair.h"

extern char reply_message[4][142];

JNIEXPORT jbyteArray JNICALL
Java_com_liftlog_airplay_crypto_FairPlay_nativeSetup(JNIEnv *env, jclass clazz, jbyteArray request) {
    if ((*env)->GetArrayLength(env, request) != 16) {
        return NULL;
    }

    jbyte req[16];
    (*env)->GetByteArrayRegion(env, request, 0, 16, req);

    /* req[4] is the FairPlay version; only version 3 is understood. */
    if ((unsigned char) req[4] != 0x03) {
        return NULL;
    }

    int mode = (unsigned char) req[14];
    if (mode < 0 || mode > 3) {
        return NULL;
    }

    jbyteArray result = (*env)->NewByteArray(env, 142);
    if (result == NULL) {
        return NULL;
    }
    (*env)->SetByteArrayRegion(env, result, 0, 142, (const jbyte *) reply_message[mode]);
    return result;
}

JNIEXPORT jbyteArray JNICALL
Java_com_liftlog_airplay_crypto_FairPlay_nativeDecrypt(JNIEnv *env, jclass clazz,
                                                       jbyteArray keyMessage, jbyteArray cipherText) {
    if ((*env)->GetArrayLength(env, keyMessage) != 164 ||
        (*env)->GetArrayLength(env, cipherText) != 72) {
        return NULL;
    }

    unsigned char key_msg[164];
    unsigned char cipher[72];
    unsigned char out[16];

    (*env)->GetByteArrayRegion(env, keyMessage, 0, 164, (jbyte *) key_msg);
    (*env)->GetByteArrayRegion(env, cipherText, 0, 72, (jbyte *) cipher);

    /* playfair uses byte 12 as an unchecked index into a four-entry key table.
     * A client that sends anything else would read wildly out of bounds and
     * take the process down, so reject it here rather than in the maze. */
    if (key_msg[12] > 3) {
        return NULL;
    }

    playfair_decrypt(key_msg, cipher, out);

    jbyteArray result = (*env)->NewByteArray(env, 16);
    if (result == NULL) {
        memset(out, 0, sizeof(out));
        return NULL;
    }
    (*env)->SetByteArrayRegion(env, result, 0, 16, (const jbyte *) out);
    memset(out, 0, sizeof(out));
    return result;
}
