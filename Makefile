.PHONY: host armv7 clean

host:
	cmake -S . -B build/host -DCMAKE_BUILD_TYPE=Release
	cmake --build build/host --parallel

armv7:
	cmake -S . -B build/armv7 -DCMAKE_BUILD_TYPE=Release \
		-DCMAKE_TOOLCHAIN_FILE=cmake/armv7-linux-gnueabihf.cmake
	cmake --build build/armv7 --parallel

clean:
	cmake -E rm -rf build
