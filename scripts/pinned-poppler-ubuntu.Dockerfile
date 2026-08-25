FROM @@UBUNTU_IMAGE@@

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    build-essential ca-certificates cmake curl ninja-build pkg-config \
    libfontconfig1-dev libfreetype-dev libjpeg-dev liblcms2-dev \
    libopenjp2-7-dev libpng-dev libtiff-dev zlib1g-dev \
  && rm -rf /var/lib/apt/lists/*

COPY poppler-26.05.0.tar.xz /tmp/poppler.tar.xz
RUN printf '%s  %s\n' "@@POPPLER_SHA256@@" /tmp/poppler.tar.xz | sha256sum --check --strict - \
  && mkdir /tmp/poppler \
  && tar -xJf /tmp/poppler.tar.xz --strip-components=1 -C /tmp/poppler \
  && cmake -S /tmp/poppler -B /tmp/poppler/build -G Ninja \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX=/opt/poppler \
      -DENABLE_UTILS=ON \
      -DENABLE_CPP=OFF \
      -DENABLE_GLIB=OFF \
      -DENABLE_QT5=OFF \
      -DENABLE_QT6=OFF \
      -DENABLE_GOBJECT_INTROSPECTION=OFF \
      -DENABLE_BOOST=OFF \
      -DENABLE_LIBCURL=OFF \
      -DENABLE_NSS3=OFF \
      -DENABLE_GPGME=OFF \
      -DBUILD_GTK_TESTS=OFF \
      -DBUILD_QT5_TESTS=OFF \
      -DBUILD_QT6_TESTS=OFF \
      -DBUILD_CPP_TESTS=OFF \
      -DBUILD_MANUAL_TESTS=OFF \
  && cmake --build /tmp/poppler/build --target pdftoppm --parallel 2

ENTRYPOINT ["/tmp/poppler/build/utils/pdftoppm"]
