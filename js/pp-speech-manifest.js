export const SPEECH_MANIFEST = {
  "id": "whisper-small",
  "upstream": "onnx-community/whisper-small",
  "revision": "36050c46d777d46dc4b5f43f6d90574fc38f8732",
  "engine": "3.8.1",
  "cache": "pp-speech-whisper-small-36050c46-3.8.1",
  "files": [
    {
      "path": "config.json",
      "bytes": 2227,
      "sha256": "457854d452f17661e197d74aee12b8e74fb75ba30ebfaa7426d0d61ea1e08a18"
    },
    {
      "path": "generation_config.json",
      "bytes": 3893,
      "sha256": "f538b28220c6a6d6f1af1458d4141cacb4ef4963df3de98a19490440c412ddf0"
    },
    {
      "path": "preprocessor_config.json",
      "bytes": 339,
      "sha256": "a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d"
    },
    {
      "path": "tokenizer.json",
      "bytes": 2480466,
      "sha256": "27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566"
    },
    {
      "path": "tokenizer_config.json",
      "bytes": 282683,
      "sha256": "2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce"
    },
    {
      "path": "special_tokens_map.json",
      "bytes": 2194,
      "sha256": "e67ae3a0aaa99abcd9f187138e12db1f65c16a14761c50ef10eef2c174a7a691"
    },
    {
      "path": "vocab.json",
      "bytes": 1036584,
      "sha256": "50d6a919f0a0601d56a04eb583c780d18553aa388254ba3158eb6a00f13e2c1a"
    },
    {
      "path": "merges.txt",
      "bytes": 493869,
      "sha256": "2df2990a395e35e8dfbc7511e08c12d56018d8d04691e0133e5d63b21e154dc6"
    },
    {
      "path": "normalizer.json",
      "bytes": 52666,
      "sha256": "bf1c507dc8724ca9cf9903640dacfb69dae2f00edee4f21ceba106a7392f26dd"
    },
    {
      "path": "added_tokens.json",
      "bytes": 34604,
      "sha256": "9715fd2243b6f06a5858b5e32950d2853f73dd5bc201aafcf76f5082a2d8acd1"
    },
    {
      "path": "onnx/encoder_model_quantized.onnx",
      "bytes": 92326160,
      "sha256": "a43a83f3c5361cd591cfa7c36f14b43cf7cb22f47a415cc14a8d557be800fa92"
    },
    {
      "path": "onnx/decoder_model_merged_quantized.onnx",
      "bytes": 156750845,
      "sha256": "ec07c3cbb64172c39791e26ee870a65ac22b458c36722bfe2776b3dbf741e0c9"
    }
  ],
  "runtime": [
    {
      "path": "vendor/transformers/transformers.min.js",
      "bytes": 888173,
      "sha256": "aa5002b70e789798da263f5f99c62bd3e8fcd0c119258a493c40c180648365fa"
    },
    {
      "path": "vendor/transformers/ort-wasm-simd-threaded.jsep.mjs",
      "bytes": 44484,
      "sha256": "08fb86ec433c78bfb032c5d84a68b8e8e5a8d81268fa39e24314179a5767a5b9"
    },
    {
      "path": "vendor/transformers/ort-wasm-simd-threaded.jsep.wasm",
      "bytes": 21596019,
      "sha256": "c46655e8a94afc45338d4cb2b840475f88e5012d524509916e505079c00bfa39"
    }
  ],
  "label": "Whisper Small"
};
