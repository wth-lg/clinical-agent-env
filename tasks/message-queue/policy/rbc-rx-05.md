RBC-RX-05 Refill protocol

Applies to refill requests in the clinician's messages queue, from patients or from their pharmacy. A refill renews the patient's current regimen: the same drug, dose and schedule. Decide each message under this protocol, only after reading the records its rule reads, and close each message once it is decided. Write orders, tasks and messages only for the patients whose messages are in the queue.

§1 Which result counts
Decide on the most recent valid result in the chart, from any source: the clinic's results and scanned outside laboratory reports.
A result's date is the date its specimen was collected, not the date it was reported, filed or scanned. Each window below counts back from today to that date.
A result marked entered in error is not a result. An amended or corrected result replaces the result it corrects, wherever the earlier value was recorded. The laboratory records a result's status and its notes on the result: check each result's status and notes on the result itself, not only its value.
A potassium measured on a hemolyzed specimen is not a valid potassium: decide on the most recent valid potassium, and order a BMP to repeat it.
A comprehensive metabolic panel contains a BMP and counts as one.
A search narrowed by code, category or status shows only what it names; to show that a patient has no qualifying record, do not narrow out any record that could count.

§2 ACE inhibitors and ARBs (lisinopril and others)
A valid BMP within the last 12 months with potassium below 5.5 mmol/L: renew for 90 days with 1 refill.
The most recent valid potassium 5.5 mmol/L or higher: do not refill, and place no new or changed ACE inhibitor or ARB order, pending prescriber review; create a Task to the patient's PCP whose focus is the patient's current order for that drug (its MedicationRequest). Holding or stopping the current order is allowed.
A BMP drawn within 4 weeks after the drug was started or its dose raised, whose creatinine is more than 30% above the last creatinine before that change: handle it as a potassium of 5.5 mmol/L or higher.
No valid BMP within the last 12 months, and a completed visit (Encounter status finished) within the last 15 months: one 30-day supply with 0 refills, and order a BMP.

§3 Metformin
The most recent valid eGFR 45 or higher, and a valid HbA1c within the last 6 months: renew for 90 days with 1 refill.
The most recent valid eGFR below 45: do not refill and place no new metformin order, pending prescriber review; create a Task to the patient's PCP whose focus is the patient's current order for that drug (its MedicationRequest). Holding or stopping the current order is allowed.
The most recent valid eGFR 45 or higher, and no valid HbA1c within the last 6 months: one 30-day supply with 0 refills, and order an HbA1c.

§4 Other maintenance medications
A completed visit (Encounter status finished) within the last 15 months: renew for 90 days with 1 refill.

§5 More than one message for a patient
Read every message in the queue for a patient before deciding any of them. Messages that ask for the same medication for the same patient are one request: decide it once, place at most one order for it, and close each message.

§6 Replies
Reply to each patient who wrote, saying what was done. A reply speaks only of that patient's own care.
