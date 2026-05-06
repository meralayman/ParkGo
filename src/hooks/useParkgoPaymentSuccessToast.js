import { useEffect } from 'react';
import { PARKGO_PAYMENT_SUCCESS_TOAST_KEY } from '../constants/paymentToast';

/** One-shot success toast after card payment redirects to /user */
export function useParkgoPaymentSuccessToast(toast) {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(PARKGO_PAYMENT_SUCCESS_TOAST_KEY) !== '1') return;
      sessionStorage.removeItem(PARKGO_PAYMENT_SUCCESS_TOAST_KEY);
      toast('Payment successful! Your reservation is confirmed.', { variant: 'success', duration: 9000 });
    } catch {
      /* ignore */
    }
  }, [toast]);
}
