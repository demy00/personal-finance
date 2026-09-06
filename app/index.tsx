import { StyleSheet, Text, View } from 'react-native';

// The declared identity, read from the manifest rather than copied. Anything
// driving :8081 can tell this app from another process holding that port, and a
// rename cannot drift away from the assertion.
import appConfig from '../app.json';
import { TRANSACTIONS } from '../lib/fixtures/transactions';
import { formatAmountMinor } from '../lib/money';

// No database is read here, on any platform. This screen has one state: it
// renders the frozen fixture it was given. Plain views, not a virtualised list -
// every row has to be in the DOM at once for an agent to reach it by testID.

export default function IndexScreen() {
  return (
    <View style={styles.screen}>
      <Text testID="app-identity" style={styles.identity}>
        {appConfig.expo.slug}
      </Text>
      <View testID="txn-list" style={styles.list}>
        {TRANSACTIONS.map((txn) => (
          <View key={txn.id} testID={`txn-${txn.id}`} style={styles.row}>
            <Text style={styles.merchant}>{txn.merchant}</Text>
            <Text style={styles.amount}>
              {formatAmountMinor(txn.amountMinor, txn.currency)} {txn.currency}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff', padding: 16, gap: 12 },
  identity: { fontSize: 12, color: '#6b7280' },
  list: { borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  merchant: { fontSize: 16 },
  // Tabular figures so the column reads as a column. No grouping separators, no
  // symbol, no locale - presentation is deliberately not built in this phase.
  amount: { fontSize: 16, fontVariant: ['tabular-nums'] },
});
