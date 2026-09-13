import 'adatree_bank_provider.dart';
import 'bank_provider.dart';
import 'basiq_bank_provider.dart';
import 'mock_bank_provider.dart';

enum BankProviderKind { mock, basiq, adatree }

/// The single place that decides which [BankProvider] implementation the
/// app talks to. Everything else — screens, Riverpod providers — depends
/// on the [BankProvider] interface only, never on a concrete class, so
/// changing the default here (or making it per-environment, e.g. mock in
/// debug builds) never touches call sites.
class BankProviderFactory {
  const BankProviderFactory._();

  static BankProvider create(BankProviderKind kind) {
    switch (kind) {
      case BankProviderKind.mock:
        return MockBankProvider();
      case BankProviderKind.basiq:
        return BasiqBankProvider();
      case BankProviderKind.adatree:
        return AdatreeBankProvider();
    }
  }
}
