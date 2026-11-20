cmake_minimum_required(VERSION 3.16)
project(armv7_starter VERSION 0.1.0 LANGUAGES C)

if(ANDROID)
    # Android loads this shared library from MainActivity through JNI.
    add_library(armv7_starter SHARED src/main.c)
else()
    add_executable(armv7_starter src/main.c)
    install(TARGETS armv7_starter RUNTIME DESTINATION bin)
endif()

target_compile_features(armv7_starter PRIVATE c_std_11)
