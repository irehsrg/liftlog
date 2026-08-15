cmake_minimum_required(VERSION 3.18.1)
project(airplayfp C)

# The FairPlay SAP implementation ("playfair") is vendored from UxPlay/RPiPlay.
# It is deliberately kept in C: it is dense reverse-engineered bit manipulation
# where a hand-port to Kotlin would be all risk and no benefit.
add_library(airplayfp SHARED
        fairplay_jni.c
        fairplay_tables.c
        playfair/playfair.c
        playfair/omg_hax.c
        playfair/hand_garble.c
        playfair/modified_md5.c
        playfair/sap_hash.c)

target_include_directories(airplayfp PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

# The vendored sources are old-style C with a lot of intentional aliasing.
target_compile_options(airplayfp PRIVATE -w -fno-strict-aliasing -O2)

find_library(log-lib log)
target_link_libraries(airplayfp ${log-lib})
