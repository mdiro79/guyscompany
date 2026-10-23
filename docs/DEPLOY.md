# راه‌اندازی روی Vercel (بدون تنظیم دستی)

کد طوری نوشته شده که Vercel خودش پروژه را تشخیص دهد (Next.js) و با یکپارچه‌سازی Supabase همه‌چیز خودکار وصل شود.

## قدم‌ها
1. در Vercel: **Add New → Project** و ریپوی `mdiro79/guyscompany` را Import کنید. تنظیمات را دست نزنید و **Deploy** را بزنید.
   - بدون Supabase، سایت در **حالت نمایشی** بالا می‌آید (حساب‌های نمایشی، داده‌ی موقت).
2. در صفحه‌ی پروژه در Vercel: **Storage → Connect Database → Supabase** (از Marketplace، پلن رایگان) را بزنید و پروژه را به آن وصل کنید.
   Vercel متغیرها را خودش اضافه می‌کند (`SUPABASE_URL`، `NEXT_PUBLIC_SUPABASE_*`، `SUPABASE_SERVICE_ROLE_KEY`، `POSTGRES_URL`، `POSTGRES_URL_NON_POOLING`). کد همه‌ی این نام‌ها را می‌شناسد.
3. **Deployments → Redeploy**. در هر ساخت، `scripts/db-setup.mjs` خودکار جدول‌ها، امنیت (RLS)، Realtime، چهار دفتر و سطل فایل‌ها را می‌سازد (اجرای دوباره بی‌خطر است).
4. سایت را باز کنید: چون هنوز حسابی نیست، صفحه‌ی **راه‌اندازی اولیه** باز می‌شود. حساب ادمین را بسازید. بقیه‌ی حساب‌ها را از بخش **مدیریت** بسازید.
5. بررسی: آدرس `/api/health` باید `"ok": true` و `"mode": "supabase"` نشان دهد.

## پیشنهادی (اختیاری)
- در Supabase → Authentication → Sign In / Providers: گزینه‌ی **Allow new users to sign up** را خاموش کنید (حساب‌ها را فقط ادمین می‌سازد).
- اگر می‌خواهید فقط شما ادمین اول را بسازید، قبل از قدم ۴ متغیر `ADMIN_SETUP_CODE` را در Vercel بگذارید؛ صفحه‌ی راه‌اندازی آن کد را می‌خواهد.
- `CRON_SECRET`: برای محافظت از پاک‌سازی روزانه (`/api/cron/cleanup`). Vercel آن را خودش به درخواست کرون اضافه می‌کند.
- TURN رایگان برای شبکه‌های سخت: `NEXT_PUBLIC_TURN_URLS`، `NEXT_PUBLIC_TURN_USERNAME`، `NEXT_PUBLIC_TURN_CREDENTIAL`.
- Region توابع Vercel را نزدیک Region پروژه‌ی Supabase بگذارید (Settings → Functions).

## نکته‌ها
- Vercel نسخه‌ی اصلی (Production) را از شاخه‌ی `main` می‌سازد. کد روی شاخه‌ی `claude/vibrant-mayer-b4q1xx` است؛ یا آن را در `main` ادغام کنید، یا در Vercel → Settings → Git، شاخه‌ی Production را عوض کنید.
- آپلود فایل مستقیم از مرورگر به Supabase Storage می‌رود (سقف ۴.۵ مگابایتی درخواست‌های Vercel دور زده می‌شود؛ سقف فایل ۲۰ مگابایت).
- حالت نمایشی روی Vercel فقط برای دیدن ظاهر است: داده در حافظه‌ی هر سرور جداست و ممکن است بین درخواست‌ها یکسان نباشد.
