"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_FORMS, PAYMENT_PERIOD_LABELS, periodsForForm } from "../constants";
import { phtToday } from "../pht";
import { Payments2307ApiError } from "../providers/payments2307Api";
import {
  blankToNull,
  paymentFormSchema,
  toAmount,
  type PaymentBody,
  type PaymentFormValues,
} from "../schemas";
import type { PaymentRow } from "../types";
import { DateField } from "./DateField";
import { OptionCombobox } from "./OptionCombobox";

const FORM_ID = "payment-2307-payment-form";

/** Seventeen periods and thirteen forms: past the point a plain select stays scannable. */
const FORM_OPTIONS = PAYMENT_FORMS.map((code) => ({ value: code, label: code }));
function periodOptions(formCode: string) {
  return periodsForForm(formCode).map((key) => ({
    value: key,
    label: PAYMENT_PERIOD_LABELS[key],
    searchText: `${key} ${PAYMENT_PERIOD_LABELS[key]}`,
  }));
}

function blankValues(): PaymentFormValues {
  return { periodKey: "Q1", formCode: "2550Q", paidOn: phtToday(), amount: "", referenceNo: "", remarks: "" };
}

function asFormCode(value: string): PaymentFormValues["formCode"] {
  // A row saved before the form list changed keeps its own code, so the dialog shows what is
  // stored instead of quietly repointing the money to a form nobody chose.
  return value as PaymentFormValues["formCode"];
}

function valuesFrom(payment: PaymentRow): PaymentFormValues {
  return {
    periodKey: payment.periodKey,
    formCode: asFormCode(payment.formCode),
    paidOn: payment.paidOn,
    amount: String(Number(payment.amount.toFixed(2))),
    referenceNo: payment.referenceNo ?? "",
    remarks: payment.remarks ?? "",
  };
}

interface PaymentDialogProps {
  open: boolean;
  payment: PaymentRow | null;
  companyId: number;
  year: number;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: PaymentBody) => Promise<void>;
}

export function PaymentDialog({
  open,
  payment,
  companyId,
  year,
  isSaving,
  onOpenChange,
  onSubmit,
}: PaymentDialogProps) {
  const [alert, setAlert] = useState<string | null>(null);

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: blankValues(),
  });

  // The period picker only offers the periods this form is actually filed for; a pair that slips
  // through is rejected by paymentFormSchema on save rather than repointed here.
  const formCode = useWatch({ control: form.control, name: "formCode" });

  // A stored form the list no longer accepts (2307 was a certificate, not a return) stays visible
  // so it can be corrected, rather than being replaced by whichever code sorted first.
  const storedForm = payment?.formCode ?? null;
  const storedIsNotReturn = storedForm !== null && !(PAYMENT_FORMS as readonly string[]).includes(storedForm);
  const formOptions = storedIsNotReturn
    ? [{ value: storedForm as string, label: `${storedForm} (not a return)` }, ...FORM_OPTIONS]
    : FORM_OPTIONS;

  useEffect(() => {
    if (!open) return;
    form.reset(payment ? valuesFrom(payment) : blankValues());
  }, [open, payment, form]);

  async function submit(values: PaymentFormValues) {
    if (isSaving) return;
    setAlert(null);
    try {
      await onSubmit({
        companyId,
        year,
        periodKey: values.periodKey,
        formCode: values.formCode,
        paidOn: values.paidOn,
        amount: toAmount(values.amount),
        referenceNo: blankToNull(values.referenceNo),
        remarks: blankToNull(values.remarks),
      });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof Payments2307ApiError && error.fieldErrors) {
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          if (messages?.[0] && field in values) {
            form.setError(field as keyof PaymentFormValues, { message: messages[0] });
          }
        }
      }
      setAlert(error instanceof Error ? error.message : "The payment was not saved.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isSaving) return;
        if (!next) setAlert(null);
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[600px]">
        <DialogHeader className="border-b border-border/50 px-6 py-4">
          <DialogTitle>{payment ? "Edit payment" : "Record payment"}</DialogTitle>
          <DialogDescription>
            What was actually paid for one return, {year}. Amounts are in pesos; the change log keeps before and after.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form id={FORM_ID} onSubmit={form.handleSubmit(submit)} className="flex min-h-0 flex-1 flex-col" noValidate>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {alert ? (
                <Alert variant="destructive">
                  <AlertDescription>{alert}</AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="formCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Form <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <OptionCombobox
                          options={formOptions}
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Pick a form"
                          searchPlaceholder="Search forms"
                          emptyLabel="No form matches."
                          aria-label="BIR form"
                        />
                      </FormControl>
                      {storedIsNotReturn && field.value === storedForm ? (
                        <FormDescription>
                          {storedForm} is a certificate, not a return. Pick the return this remittance belongs to.
                        </FormDescription>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="periodKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Period <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <OptionCombobox
                          options={periodOptions(formCode)}
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Pick a period"
                          searchPlaceholder="Search periods"
                          emptyLabel="No period matches."
                          aria-label="Return period"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="paidOn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Paid on <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <DateField
                          inDialog
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Pick the payment date"
                          aria-label="Payment date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Amount <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          inputMode="decimal"
                          className="text-right tabular-nums"
                          placeholder="0.00"
                        />
                      </FormControl>
                      <FormDescription>
                        Enter 0 to file a nil or zero return, then fill the BIR reference below.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="referenceNo"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Reference</FormLabel>
                      <FormControl>
                        <Input {...field} maxLength={80} placeholder="BIR acknowledgement or bank reference" />
                      </FormControl>
                      <FormDescription>A nil return is only accepted with this number.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="remarks"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Remarks</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={2} maxLength={300} placeholder="Optional note" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter className="border-t border-border/50 bg-muted/20 px-6 py-4">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSaving}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" form={FORM_ID} disabled={isSaving} className="min-h-11 md:min-h-0">
                {isSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {payment ? "Save payment" : "Record payment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
