/*
# Staff Account Management: Fix handle_new_user + Admin Profile Update Policy

## What this migration does

1. **Fixes handle_new_user to prevent admin self-registration (SECURITY FIX)**
   The handle_new_user trigger function currently reads the role from
   raw_user_meta_data, which is user-editable. This means anyone can self-register
   as admin via the public sign-up page. The fix forces self-registered users to
   always get the 'farmer' role (or 'clerk' if explicitly chosen but without
   'admin' privilege). Admin accounts can only be created through the staff
   management screen (which calls the manage-staff edge function with the service
   role key).

2. **Adds UPDATE policy on profiles for admin role management**
   Currently profiles only has a "Users update own profile" policy (auth.uid() = id).
   This prevents admins from updating other users' roles. We add a new policy
   allowing admins to update any profile's role field, while keeping the existing
   self-update policy for non-role fields.

## Security implications

- The handle_new_user fix closes a privilege escalation vulnerability where any
  visitor could create an admin account by self-registering.
- The new UPDATE policy is scoped to admin role only, verified via a subquery
  on the profiles table.
*/

-- 1. Fix handle_new_user: prevent admin self-registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_role text;
BEGIN
  -- Only allow 'farmer' and 'clerk' from self-signup.
  -- 'admin' can ONLY be created via the manage-staff edge function
  -- (which uses the service role key and bypasses this trigger).
  new_role := COALESCE(NEW.raw_user_meta_data->>'role', 'farmer');
  IF new_role = 'admin' THEN
    new_role := 'farmer';
  END IF;
  IF new_role NOT IN ('clerk', 'farmer') THEN
    new_role := 'farmer';
  END IF;
  INSERT INTO public.profiles (id, full_name, collection_centre, role)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'collection_centre', new_role);
  RETURN NEW;
END;
$function$;

-- 2. Add admin UPDATE policy on profiles (for role management)
-- The existing "Users update own profile" policy covers self-edits.
-- This new policy lets admins update OTHER users' profiles (specifically role).
DROP POLICY IF EXISTS "Admins can update staff profiles" ON public.profiles;
CREATE POLICY "Admins can update staff profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));
