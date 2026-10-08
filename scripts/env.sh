# Usa el JDK 17 portátil que vive en el disco externo
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export JAVA_HOME="$(ls -d "$ROOT"/jdk/*/Contents/Home | head -1)"
export PATH="$JAVA_HOME/bin:$PATH"
