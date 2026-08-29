-- Trace métier : assistance OTP par le gestionnaire (relai code / validation manuelle)
ALTER TYPE manager_task_type ADD VALUE IF NOT EXISTS 'otp_manager_assist';
