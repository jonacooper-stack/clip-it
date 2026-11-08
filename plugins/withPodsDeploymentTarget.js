// Raise every CocoaPods target to at least iOS 15.1 (the app's own minimum on
// Expo SDK 52).
//
// Newer Xcode releases (on EAS's current build images) refuse deployment
// targets below iOS 15. React Native's post_install already bumps each pod's
// main target, but NOT the resource-bundle targets some pods generate
// (e.g. "SDWebImage-SDWebImage", "RNCAsyncStorage-RNCAsyncStorage_resources",
// "ReachabilitySwift-ReachabilitySwift"), which still declare iOS 9–13 and fail
// the build. This walks every target in Pods.xcodeproj and raises any that are
// lower. Never lowers a target.
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MIN = '15.1';
const MARKER = '# [withPodsDeploymentTarget]';

const SNIPPET = `
    ${MARKER} raise all pod targets (incl. resource bundles) to iOS ${MIN}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        current = config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || current.to_f < ${MIN}
          config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN}'
        end
      end
    end
`;

module.exports = function withPodsDeploymentTarget(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfile, 'utf8');
      if (contents.includes(MARKER)) return cfg;
      const hook = /post_install do \|installer\|\n/;
      if (!hook.test(contents)) {
        throw new Error('withPodsDeploymentTarget: could not find the post_install block in ios/Podfile');
      }
      // Runs first inside post_install; React Native's own bump afterwards only
      // ever raises targets further, so the order is safe.
      contents = contents.replace(hook, (m) => m + SNIPPET);
      fs.writeFileSync(podfile, contents);
      return cfg;
    },
  ]);
};
