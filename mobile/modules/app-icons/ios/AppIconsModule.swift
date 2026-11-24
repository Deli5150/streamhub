import ExpoModulesCore
import UIKit

// iPhone's alternate icons: each is an AppIcon-<id> icon set in the asset catalogue (added by
// plugins/withAppIcons.js). iOS shows a short alert whenever an app changes its icon.
public class AppIconsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppIcons")

    Function("current") { () -> String in
      let name = Thread.isMainThread ? UIApplication.shared.alternateIconName : DispatchQueue.main.sync { UIApplication.shared.alternateIconName }
      guard let name, name.hasPrefix("AppIcon-") else { return "default" }
      return String(name.dropFirst("AppIcon-".count))
    }

    AsyncFunction("set") { (id: String, promise: Promise) in
      DispatchQueue.main.async {
        guard UIApplication.shared.supportsAlternateIcons else { return promise.resolve(false) }
        let name: String? = id == "default" ? nil : "AppIcon-\(id)"
        if UIApplication.shared.alternateIconName == name { return promise.resolve(true) }
        UIApplication.shared.setAlternateIconName(name) { error in
          promise.resolve(error == nil)
        }
      }
    }
  }
}
