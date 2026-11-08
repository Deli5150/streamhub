import AVKit
import ExpoModulesCore

// The cast button on iPhone: Apple's own AirPlay button (AVRoutePickerView). Tapping it opens the
// system's device picker; picking an Apple TV or AirPlay TV sends the video that's playing to it.
public final class StreamhubCastModule: Module {
  public func definition() -> ModuleDefinition {
    Name("StreamhubCast")

    View(StreamhubCastView.self) {
      Prop("tint") { (view: StreamhubCastView, color: UIColor?) in
        view.picker.tintColor = color ?? .label
      }
      Prop("activeTint") { (view: StreamhubCastView, color: UIColor?) in
        view.picker.activeTintColor = color ?? .systemBlue
      }
    }
  }
}

public final class StreamhubCastView: ExpoView {
  let picker = AVRoutePickerView()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    // List TVs and other video-capable devices first, since what's being sent is video.
    picker.prioritizesVideoDevices = true
    addSubview(picker)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    picker.frame = bounds
  }
}
