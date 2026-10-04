CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  collection_centre text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, collection_centre)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'collection_centre');
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.farmers (
  farmer_code text PRIMARY KEY,
  full_name text NOT NULL,
  location text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.farmers TO authenticated;
GRANT ALL ON public.farmers TO service_role;
ALTER TABLE public.farmers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view farmers" ON public.farmers FOR SELECT TO authenticated USING (true);

CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_code text NOT NULL REFERENCES public.farmers(farmer_code),
  quantity_kg numeric(7,2) NOT NULL,
  quality_grade text NOT NULL,
  status text NOT NULL DEFAULT 'Accepted',
  collected_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.collections TO authenticated;
GRANT ALL ON public.collections TO service_role;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view collections" ON public.collections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff record own collections" ON public.collections FOR INSERT TO authenticated WITH CHECK (auth.uid() = received_by);

INSERT INTO public.farmers (farmer_code, full_name, location) VALUES
('MF-1001','Kiprono Koech','Kapsabet'),
('MF-1002','Wanjiru Kamau','Ol Kalou'),
('MF-1003','Otieno Odhiambo','Kisii'),
('MF-1004','Chebet Rotich','Nandi Hills'),
('MF-1005','Mwangi Njoroge','Nyahururu'),
('MF-1006','Akinyi Achieng','Bomet'),
('MF-1007','Kibet Langat','Eldoret'),
('MF-1008','Njeri Wambui','Kinangop');

INSERT INTO public.collections (farmer_code, quantity_kg, quality_grade, status, collected_at) VALUES
('MF-1001',45,'Grade A','Accepted', date_trunc('day', now()) + interval '6 hours 30 minutes'),
('MF-1002',32.5,'Grade A','Accepted', date_trunc('day', now()) + interval '6 hours 42 minutes'),
('MF-1003',28,'Grade B','Accepted', date_trunc('day', now()) + interval '6 hours 55 minutes'),
('MF-1004',51,'Grade A','Accepted', date_trunc('day', now()) + interval '7 hours 10 minutes'),
('MF-1005',19.5,'Grade C','Pending Test', date_trunc('day', now()) + interval '7 hours 24 minutes'),
('MF-1006',12,'Rejected','Rejected', date_trunc('day', now()) + interval '7 hours 38 minutes'),
('MF-1007',38,'Grade B','Accepted', date_trunc('day', now()) - interval '1 day' + interval '17 hours 5 minutes'),
('MF-1008',41.5,'Grade A','Accepted', date_trunc('day', now()) - interval '1 day' + interval '17 hours 20 minutes');