-- Pilot Signup & New-Farm Acceptance hardening.
--
-- The quote RPCs below are SECURITY DEFINER functions intended for signed-in
-- users/operators. Their explicit authenticated/service_role grants already
-- exist, but PostgreSQL's default PUBLIC execute grant remained on these
-- later-created functions. Because the web app necessarily exposes the
-- Supabase anon key, PUBLIC execute also made them callable by anonymous
-- clients.
--
-- Tighten only the unintended PUBLIC grant. Do not change function bodies,
-- authenticated grants, RLS policies, or data.

revoke execute on function public.allocate_quote_offer(uuid, uuid, numeric, numeric, numeric) from public;
revoke execute on function public.answer_quote_offer_question(uuid, text) from public;
revoke execute on function public.ask_quote_offer_question(uuid, text, text) from public;
revoke execute on function public.create_quote_enquiry_batch(uuid, uuid[], text, text, text) from public;
revoke execute on function public.create_quote_enquiry_dispatch(uuid, text) from public;
revoke execute on function public.discard_quote_enquiry_batch(uuid) from public;
revoke execute on function public.finalize_quote_enquiry_dispatch(uuid, text, text, text, text) from public;
revoke execute on function public.record_quote_farmer_interest(uuid, text, text, text) from public;
revoke execute on function public.record_quote_supplier_response(
  uuid, numeric, numeric, text, text, text, numeric, text, date, text, text, text, text
) from public;
revoke execute on function public.release_quote_farmer_offer(uuid) from public;
revoke execute on function public.update_quote_enquiry_draft(uuid, text, text, text) from public;
