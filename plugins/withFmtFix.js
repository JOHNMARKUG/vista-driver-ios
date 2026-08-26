/**
 * Config plugin: fixes "call to consteval function fmt::basic_format_string
 * is not a constant expression" build failure on Xcode 26.4+ / Apple Clang 21.
 *
 * Two-pronged approach applied via Podfile post_install:
 *
 * 1. Force C++17 (CLANG_CXX_LANGUAGE_STANDARD) on the pods that contain fmt
 *    source (fmt, RCT-Folly, boost, hermes-engine). consteval does not exist
 *    in C++17, so the problem code path is compiled away entirely.
 *
 * 2. Also define FMT_USE_CONSTEVAL=0 for ALL pod targets as a fallback, which
 *    switches fmt to its non-consteval path in case the C++17 flag does not
 *    propagate to every compilation unit that includes fmt headers.
 *
 * NOTE: withPodfileProperties (suggested by some guides) writes to
 * Podfile.properties.json — it does NOT execute Ruby in the Podfile.
 * withDangerousMod is the correct API for patching the Podfile itself.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const FMT_FIX_RUBY = `
  # Fix: fmt consteval hard error with Xcode 26.4+ / Apple Clang 21
  # Force C++17 on fmt-related pods and define FMT_USE_CONSTEVAL=0 for all.
  FMT_PODS = %w[fmt RCT-Folly boost hermes-engine].freeze
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |cfg|
      if FMT_PODS.any? { |name| target.name.start_with?(name) }
        cfg.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
      end
      existing = cfg.build_settings['OTHER_CPLUSPLUSFLAGS'] || '$(inherited)'
      next if existing.include?('FMT_USE_CONSTEVAL')
      cfg.build_settings['OTHER_CPLUSPLUSFLAGS'] = existing + ' -DFMT_USE_CONSTEVAL=0'
    end
  end
`;

module.exports = function withFmtFix(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) return config;

      let contents = fs.readFileSync(podfilePath, 'utf8');
      if (contents.includes('FMT_USE_CONSTEVAL')) return config; // already patched

      const anchor = 'post_install do |installer|';
      if (!contents.includes(anchor)) {
        console.warn('[withFmtFix] No post_install block found in Podfile — skipping patch');
        return config;
      }

      contents = contents.replace(anchor, anchor + FMT_FIX_RUBY);
      fs.writeFileSync(podfilePath, contents);
      console.log('[withFmtFix] Patched Podfile: C++17 for fmt pods + FMT_USE_CONSTEVAL=0 for all');
      return config;
    },
  ]);
};
