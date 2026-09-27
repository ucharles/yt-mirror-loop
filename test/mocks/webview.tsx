/* Jest mock of react-native-webview: records the last instance so tests can inject messages. */
import { forwardRef, useImperativeHandle } from 'react';
import { View } from 'react-native';

export const webviewCalls: { injected: string[]; props: any } = { injected: [], props: null };

export const WebView = forwardRef(function WebView(props: any, ref) {
  webviewCalls.props = props;
  useImperativeHandle(ref, () => ({
    injectJavaScript: (js: string) => webviewCalls.injected.push(js),
  }));
  return <View testID={props.testID ?? 'webview'} />;
});
export default WebView;
