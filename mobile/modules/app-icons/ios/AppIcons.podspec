Pod::Spec.new do |s|
  s.name           = 'AppIcons'
  s.version        = '1.0.0'
  s.summary        = 'Alternate app icons'
  s.description    = 'Switches the home-screen icon between the icons in the asset catalogue.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
