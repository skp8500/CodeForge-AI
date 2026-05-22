#!/bin/bash
set -e

echo "Building CodeForge judge sandbox images..."

docker build -t codeforge/compiler-cpp:latest -f docker/cpp/Dockerfile.compile docker/cpp
docker build -t codeforge/runner-cpp:latest -f docker/cpp/Dockerfile.run docker/cpp
docker build -t codeforge/runner-python:latest -f docker/python/Dockerfile docker/python
docker build -t codeforge/compiler-java:latest -f docker/java/Dockerfile.compile docker/java
docker build -t codeforge/runner-java:latest -f docker/java/Dockerfile.run docker/java
docker build -t codeforge/runner-javascript:latest -f docker/javascript/Dockerfile docker/javascript

echo "✓ All sandbox images built successfully"
docker images | grep codeforge
