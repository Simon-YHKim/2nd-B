// /account-deleted -- the account deletion receipt (Simon decision
// Q-261004-42 = A). (auth) group: readable while signed out, exempt from the
// profile-completion redirect and the account-transition reset. The receipt
// itself is the server's record (0217), fetched by the number in the URL; the
// screen shows it only while no account is signed in.
import { AccountDeletionReceiptScreen } from "@/components/account/AccountDeletionReceiptScreen";

export default function AccountDeletedRoute() {
  return <AccountDeletionReceiptScreen />;
}
