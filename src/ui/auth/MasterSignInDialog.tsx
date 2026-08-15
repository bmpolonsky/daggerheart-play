/** @jsxImportSource preact */
import { LogIn, LogOut, UserRound, X } from 'lucide-react';
import { useEffect, useState } from 'preact/hooks';
import { useStream } from '../../core/hooks/useStream';
import type { SupabaseSessionConfig } from '../../domain/p2p/supabaseSession';
import {
  initializeSupabaseMasterAuth,
  signInSupabaseMaster,
  signInSupabaseMasterByEmail,
  signOutSupabaseMaster,
  supabaseMasterAuth$
} from '../../services/supabaseClient';
import { toastService } from '../../services/ToastService';
import { Button, Dialog, IconButton, Notice, TextControl, Toolbar } from '../components/common';
import styles from './MasterSignInDialog.module.css';

export function MasterAccountControl({ config }: { config: SupabaseSessionConfig }) {
  const auth = useStream(supabaseMasterAuth$);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void initializeSupabaseMasterAuth(config);
  }, [config.publishableKey, config.url]);

  const label = auth.status === 'signedIn' ? auth.email || 'Аккаунт' : auth.status === 'loading' ? 'Проверяем…' : 'Войти';
  return (
    <>
      <Button
        className={styles.accountButton}
        variant="ghost"
        size="xs"
        noWrap
        iconBefore={auth.status === 'signedIn' ? <UserRound size={13} aria-hidden="true" /> : <LogIn size={13} aria-hidden="true" />}
        disabled={auth.status === 'loading'}
        onClick={() => setOpen(true)}
      >
        <span>{label}</span>
      </Button>
      {open && <MasterSignInDialog config={config} onClose={() => setOpen(false)} />}
    </>
  );
}

export function MasterSignInDialog({ config, onClose }: { config: SupabaseSessionConfig; onClose: () => void }) {
  const auth = useStream(supabaseMasterAuth$);
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void initializeSupabaseMasterAuth(config);
  }, [config.publishableKey, config.url]);

  const signInGoogle = async () => {
    setBusy(true);
    try {
      await signInSupabaseMaster(config, window.location.href);
    } catch {
      setBusy(false);
      toastService.show('Не удалось открыть вход через Google.', 'error');
    }
  };

  const signInEmail = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await signInSupabaseMasterByEmail(config, email, window.location.href);
      setEmailSent(true);
    } catch {
      toastService.show('Не удалось отправить ссылку для входа.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await signOutSupabaseMaster(config);
      onClose();
    } catch {
      setBusy(false);
      toastService.show('Не удалось выйти из аккаунта.', 'error');
    }
  };

  return (
    <Dialog
      aria-label="Аккаунт мастера"
      className={styles.shell}
      title="Аккаунт мастера"
      actions={<IconButton variant="ghost" size="sm" aria-label="Закрыть" title="Закрыть" onClick={onClose}><X size={17} aria-hidden="true" /></IconButton>}
      onClose={onClose}
    >
      <div className={styles.content}>
        {auth.status === 'signedIn' ? (
          <div className={styles.account}>
            <Notice tone="success">Вы вошли как {auth.email || 'мастер'}.</Notice>
            <Toolbar><Button variant="ghost" iconBefore={<LogOut size={15} aria-hidden="true" />} disabled={busy} onClick={() => void signOut()}>Выйти</Button></Toolbar>
          </div>
        ) : (
          <>
            <div className={styles.provider}>
              <Button variant="primary" fullWidth iconBefore={<LogIn size={16} aria-hidden="true" />} disabled={busy} onClick={() => void signInGoogle()}>
                Войти через Google
              </Button>
            </div>
            <div className={styles.divider}>или по почте</div>
            {emailSent ? (
              <Notice tone="success">Ссылка для входа отправлена.</Notice>
            ) : (
              <div className={styles.email}>
                <TextControl
                  type="email"
                  autoComplete="email"
                  aria-label="Почта мастера"
                  placeholder="name@example.com"
                  value={email}
                  onInput={(event) => setEmail(event.currentTarget.value)}
                />
                <Button fullWidth disabled={busy || !email.trim()} onClick={() => void signInEmail()}>Отправить ссылку</Button>
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
