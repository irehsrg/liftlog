# Fire TV AirPlay Receiver

An AirPlay mirroring receiver for Amazon Fire TV, for personal use on your own
network. Pick the Fire TV from the AirPlay menu on an iPhone, iPad, or Mac and
its screen shows up on the TV.

Video is the point; audio is implemented too, with the caveats below.

> **This has not been tested against a real device.** It was written and built
> in an environment with no Fire TV and no Apple hardware, so while it compiles,
> the unit tests pass, and the protocol logic is ported from a known-working
> implementation, the end-to-end path has never actually run. Expect to do some
> debugging with `adb logcat` on first use. See
> [First run](#first-run-and-what-to-check) for what to look at.

## What works

| | |
|---|---|
| Screen mirroring | H.264, up to 1080p, decoded with `MediaCodec` straight to a `SurfaceView` |
| Discovery | `_airplay._tcp` and `_raop._tcp` over mDNS |
| Pairing | AirPlay legacy pairing (Ed25519 / X25519) |
| Encryption | FairPlay SAP v2.5 key exchange, AES-128-CTR stream decryption |
| Audio | AAC-ELD and AAC-LC over RTP, AES-128-CBC |

## What it deliberately does not do

- **No HEVC/4K.** The receiver advertises itself as an Apple TV 3 with the
  `SupportsScreenMultiCodec` feature bit off, so clients send H.264. This keeps
  one decode path instead of two.
- **No A/V sync.** Video frames are rendered the moment they decode and audio
  plays as it arrives. There is no NTP clock sync with the client and no jitter
  buffer, so audio may drift against video. This is why audio is a bonus rather
  than a feature.
- **No ALAC**, no audio-only AirPlay (the `_raop` service exists to make
  mirroring work, not to be a speaker), no video URL playback (YouTube-style
  "AirPlay this video" hand-off), no on-screen PIN or password.
- **One client at a time**, in practice.

## Building

Needs a JDK, the Android SDK with NDK r26, and CMake. From this directory:

```sh
echo "sdk.dir=/path/to/android-sdk" > local.properties
./gradlew assembleDebug
```

The APK lands at `app/build/outputs/apk/debug/app-debug.apk`. Use the debug one
for sideloading — it is signed with the standard debug key, whereas
`assembleRelease` produces an unsigned APK you would have to sign yourself.

Run the unit tests with `./gradlew testDebugUnitTest`.

## Installing on the Fire TV

Enable *Settings → My Fire TV → Developer Options → ADB Debugging*, then:

```sh
adb connect <fire-tv-ip>:5555
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The app appears in the Fire TV launcher as **AirPlay Receiver**. Launch it and
leave it in the foreground — the mirrored picture is drawn by the activity, so
the receiver can only show video while it is on screen.

## First run, and what to check

Both devices must be on the same network, and that network must allow multicast
and client-to-client traffic. Guest/isolation modes on consumer routers break
discovery, as does having the phone on 5 GHz and the stick on a separate VLAN.

```sh
adb logcat -s AirPlayService AirPlayServer AirPlayConn AirPlayMdns AirPlayMirror AirPlayVideo AirPlayAudio
```

Roughly in order, a healthy session logs:

1. `AirPlayMdns: advertising 'Fire TV' on 192.168.x.x:7000` — if this never
   appears, the receiver did not find a usable network address.
2. `AirPlayConn: <- GET /info ...` — the client found it. If you see the device
   in the AirPlay menu but nothing here, it is a firewall or routing problem.
3. `AirPlayConn: session established with <name>` — pairing and the FairPlay key
   exchange both succeeded.
4. `AirPlayMirror: mirroring client connected` then
   `AirPlayVideo: decoder configured 1920x1080`.

The failure worth knowing by sight is
`AirPlayMirror: dropping packet that did not decrypt to valid H.264`. That means
the session key is wrong rather than the video being corrupt — the stream key is
derived from the FairPlay key *hashed with the pairing shared secret*, so it
points at the pairing or FairPlay step, not the decoder.

## How it fits together

```
MdnsAdvertiser ──── advertises _airplay._tcp + _raop._tcp
                                   │
RtspServer ──── AirPlayConnection ─┤ GET /info        device description
   (TCP 7000)      (one per        ├ POST /pair-setup  \ Ed25519 + X25519,
                    connection)    ├ POST /pair-verify /  yields shared secret
                                   ├ POST /fp-setup    FairPlay handshake
                                   └ SETUP             unwraps the AES key,
                                                       opens the streams below
                                   │
        ┌──────────────────────────┴───────────────────┐
   MirrorStream (TCP)                            AudioStream (UDP)
   MirrorCipher: AES-128-CTR                     AES-128-CBC per packet
   length prefixes → Annex-B                     AAC-ELD → AudioTrack
   VideoDecoder → Surface
```

`AirPlayService` is a foreground service that owns all of the above, so
discovery survives the activity being recreated. `MainActivity` contributes
nothing but the `Surface` and the idle screen.

The one subtle piece is the mirroring cipher. The video stream is a single
continuous AES-CTR keystream over the concatenation of every packet payload, but
packets rarely end on a 16-byte boundary, so leftover keystream from a partial
block has to carry into the next packet. `MirrorCipherTest` pins this down
against a plain `javax.crypto` CTR reference.

## Third-party code and licensing

`app/src/main/cpp/playfair/` and `fairplay_tables.c` are vendored **verbatim**
from [UxPlay](https://github.com/FDH2/UxPlay), which took them in turn from
Juho Vähä-Herttua's shairplay. They implement FairPlay SAP, which is
reverse-engineered from Apple's implementation and is the one part of this that
cannot be written from a specification. It is kept in C and called over JNI
precisely because hand-porting dense reverse-engineered bit manipulation would
be all risk and no benefit.

That code is LGPL-2.1-or-later (see `app/src/main/cpp/playfair/LICENSE.md`), and
the protocol logic in Kotlin is a port of UxPlay's, so treat this project as
carrying those terms. It is intended for personal use with hardware you own.

One deliberate change from upstream: `decryptMessage` uses byte 12 of the
164-byte fp-setup message as an unchecked index into a four-entry table, so a
malformed message walks off the end of it and takes the process down. The JNI
wrapper rejects values above 3 before calling in.

Other dependencies: BouncyCastle (Ed25519/X25519 — the platform JCE on Fire OS 7
has no Ed25519), dd-plist (Apple binary property lists), and jmdns (Android's
`NsdManager` cannot express the `@`-prefixed `_raop` instance name or the full
TXT record set).
