-- T06: FIRST disable Authentication > Hooks > Before User Created.
-- Run this whole file in one transaction after disabling the hook. No CASCADE.
-- Removes only T06 state (hashes and counters); 0113 remains the backstop.
DROP FUNCTION public.before_user_created_signup(jsonb);
DROP FUNCTION public.prune_signup_hook_attempts();
DROP TABLE public.signup_hook_attempts;
DROP TABLE public.signup_hook_policy;
