import { DEFAULT_TOPIC_PREFIX } from '@integralo/contract';
import { Text, View } from 'react-native';

/** Temporary start screen: checks that routing, NativeWind and the shared contract work together. */
export default function Home() {
  return (
    <View className="flex-1 items-center justify-center bg-slate-950 px-6">
      <Text className="text-3xl font-bold text-white">IntegrAlo</Text>
      <Text className="mt-2 text-base text-slate-400">Supervisión y control · {DEFAULT_TOPIC_PREFIX}</Text>
    </View>
  );
}
