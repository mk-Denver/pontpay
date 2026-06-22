import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Download,
  Upload,
  Eye,
  EyeOff,
  Key,
  ChevronDown,
  ChevronUp,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import { toast } from '@/hooks/useToast';
import {
  useLoginActions,
  generateNostrConnectParams,
  generateNostrConnectURI,
  type NostrConnectParams,
  type NostrConnectStatus,
} from '@/hooks/useLoginActions';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'welcome' | 'generate' | 'secure' | 'profile' | 'login' | 'connect';

const validateNsec = (nsec: string) => /^nsec1[a-zA-Z0-9]{58}$/.test(nsec);
const validateBunkerUri = (uri: string) => uri.startsWith('bunker://');

const connectStatusLabel = (status: NostrConnectStatus | null): string => {
  switch (status) {
    case 'awaiting-connect':
      return 'Waiting for signer connection…';
    case 'getting-public-key':
      return 'Getting public key…';
    default:
      return '';
  }
};

/** Check if running on an actual mobile device (not just a small screen). */
function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Download an nsec to a text file — same behavior as the previous SignupDialog. */
function downloadNsecFile(nsec: string) {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') throw new Error('Invalid nsec key');
  const pubkey = getPublicKey(decoded.data);
  const npub = nip19.npubEncode(pubkey);
  const filename = `nostr-${location.hostname.replaceAll(/\./g, '-')}-${npub.slice(5, 9)}.nsec.txt`;

  const blob = new Blob([nsec], { type: 'text/plain; charset=utf-8' });
  const url = globalThis.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  globalThis.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

const AuthDialog: React.FC<AuthDialogProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<Step>('welcome');

  // Signup state
  const [nsec, setNsec] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [profileData, setProfileData] = useState({ name: '', about: '', picture: '' });

  // Login state
  const [loginNsec, setLoginNsec] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  // Nostrconnect / bunker state
  const [nostrConnectParams, setNostrConnectParams] = useState<NostrConnectParams | null>(null);
  const [nostrConnectUri, setNostrConnectUri] = useState('');
  const [connectError, setConnectError] = useState<string | null>(null);
  // Progress status for the nostrconnect handshake. `null` means the user
  // hasn't kicked off the handshake yet (or they canceled) — we show the QR
  // / "Open signer app" button. Once the handshake advances we swap in a
  // spinner with a live status line so the user knows something is working.
  const [connectStatus, setConnectStatus] = useState<NostrConnectStatus | null>(null);
  // Tracks whether the user has explicitly initiated the handshake from the
  // mobile UI. The listen subscription itself starts the moment params are
  // generated — without this flag we'd flip into the progress view as soon
  // as the user enters the Remote Signer step, before they've done anything.
  // Desktop doesn't need this: it stays on the QR until the handshake
  // advances past `awaiting-connect`.
  const [hasOpenedSigner, setHasOpenedSigner] = useState(false);
  const [showBunkerInput, setShowBunkerInput] = useState(false);
  const [bunkerUri, setBunkerUri] = useState('');

  const login = useLoginActions();
  // Stable refs so the nostrconnect listening effect below doesn't restart on
  // every parent render. Parents typically pass inline arrow functions for
  // onClose, and useLoginActions returns a fresh object each render — without
  // stable refs, an effect depending on them would tear down the in-flight
  // subscription on every render and cause approved logins to be swallowed.
  const loginRef = useRef(login);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    loginRef.current = login;
  }, [login]);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const { mutateAsync: publishEvent, isPending: isPublishing } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { user: currentUser } = useCurrentUser();
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMobile = useIsMobile();

  const hasExtension = typeof window !== 'undefined' && 'nostr' in window;

  // Reset state when the dialog closes.
  // This is the "reset state when a prop changes" pattern; the usual
  // React-preferred alternative is a `key` prop on the caller, but the
  // public API of this component is a simple open/close boolean, so we
  // reset here. The multiple setState calls are intentional.
  useEffect(() => {
    if (!isOpen) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setStep('welcome');
      setNsec('');
      setLoginNsec('');
      setShowKey(false);
      setIsGenerating(false);
      setIsLoggingIn(false);
      setLoginError('');
      setShowMoreOptions(false);
      setProfileData({ name: '', about: '', picture: '' });
      setNostrConnectParams(null);
      setNostrConnectUri('');
      setConnectError(null);
      setConnectStatus(null);
      setHasOpenedSigner(false);
      setShowBunkerInput(false);
      setBunkerUri('');
      /* eslint-enable react-hooks/set-state-in-effect */
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    }
  }, [isOpen]);

  // Generate a nostrconnect session (QR code data).
  const generateConnectSession = useCallback(() => {
    const relayUrls = login.getRelayUrls();
    const params = generateNostrConnectParams(relayUrls);
    const uri = generateNostrConnectURI(params, {
      callback: isMobileDevice() ? `${window.location.origin}/remoteloginsuccess` : undefined,
    });
    setNostrConnectParams(params);
    setNostrConnectUri(uri);
    setConnectError(null);
  }, [login]);

  // Start listening for a nostrconnect response once params are set.
  //
  // Deps are intentionally limited to `nostrConnectParams` so that parent
  // re-renders (which produce fresh onClose closures and a fresh `login`
  // object from useLoginActions) do NOT tear down an in-flight
  // subscription. An earlier version used a `cancelled` flag flipped by
  // the effect's cleanup, which caused a successful nostrconnect response
  // to be silently swallowed after the signer approved — the subscription
  // was re-created mid-handshake and the first instance's success branch
  // saw `cancelled === true`.
  //
  // Cancellation is handled explicitly by the `isOpen` effect (on dialog
  // close) and by handleConnectRetry() (on user cancel/retry).
  useEffect(() => {
    if (!nostrConnectParams) return;

    const startListening = async () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        await loginRef.current.nostrconnect(
          nostrConnectParams,
          controller.signal,
          (status) => {
            if (controller.signal.aborted) return;
            setConnectStatus(status);
          },
        );
        // If the dialog was explicitly closed (handled by the isOpen
        // effect, which aborts the controller), don't try to re-close it.
        // Otherwise the user is logged in — close the dialog.
        if (controller.signal.aborted) return;
        onCloseRef.current();
      } catch (error) {
        // AbortError means we intentionally aborted (dialog closed or retry)
        if (error instanceof Error && error.name === 'AbortError') return;
        if (controller.signal.aborted) return;
        console.error('Nostrconnect failed:', error);
        setConnectStatus(null);
        setConnectError(error instanceof Error ? error.message : String(error));
      }
    };

    startListening();

    // No cleanup here: we do NOT want a re-render-triggered effect teardown
    // to cancel the in-flight subscription.
  }, [nostrConnectParams]);

  const handleConnectRetry = useCallback(() => {
    abortControllerRef.current?.abort();
    setNostrConnectParams(null);
    setNostrConnectUri('');
    setConnectError(null);
    setConnectStatus(null);
    setHasOpenedSigner(false);
    setTimeout(() => generateConnectSession(), 0);
  }, [generateConnectSession]);

  const handleOpenSignerApp = () => {
    if (!nostrConnectUri) return;
    // Flip into the progress view *synchronously* before navigating so that
    // when the user returns from the signer app, the dialog is already
    // showing "Waiting for signer connection…" — not the original button
    // they're worried they need to re-tap.
    setHasOpenedSigner(true);
    window.location.href = nostrConnectUri;
  };

  const handleBunkerLogin = async () => {
    if (!bunkerUri.trim() || !validateBunkerUri(bunkerUri)) return;

    setIsLoggingIn(true);
    try {
      await login.bunker(bunkerUri);
      onClose();
    } catch {
      setConnectError('Failed to connect. Check the bunker URI.');
      setIsLoggingIn(false);
    }
  };

  const goToConnect = () => {
    setStep('connect');
    if (!nostrConnectParams && !connectError) {
      generateConnectSession();
    }
  };

  // Signup: generate a key with a brief spinner for feedback.
  const generateKey = () => {
    setIsGenerating(true);
    setTimeout(() => {
      const sk = generateSecretKey();
      setNsec(nip19.nsecEncode(sk));
      setStep('secure');
      setIsGenerating(false);
    }, 750);
  };

  // Signup: download the nsec to a file and move on to the profile step.
  const downloadAndProceed = () => {
    try {
      downloadNsecFile(nsec);
      login.nsec(nsec);
      setStep('profile');
    } catch {
      toast({
        title: 'Download failed',
        description: 'Could not download the key file. Please copy it manually.',
        variant: 'destructive',
      });
    }
  };

  // Login: submit the entered nsec.
  const handleLogin = () => {
    if (!loginNsec.trim()) {
      setLoginError('Enter your secret key.');
      return;
    }
    if (!validateNsec(loginNsec)) {
      setLoginError('Invalid secret key. Must start with nsec1.');
      return;
    }

    setIsLoggingIn(true);
    setLoginError('');
    // Timeout gives the UI a chance to repaint before the synchronous login.
    setTimeout(() => {
      try {
        login.nsec(loginNsec);
        onClose();
      } catch {
        setLoginError("Couldn't log in with this key.");
        setIsLoggingIn(false);
      }
    }, 50);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content && validateNsec(content.trim())) {
        setLoginNsec(content.trim());
      } else {
        setLoginError('File does not contain a valid secret key.');
      }
    };
    reader.onerror = () => setLoginError('Failed to read file.');
    reader.readAsText(file);
  };

  const handleExtensionLogin = async () => {
    if (!hasExtension) return;
    setIsLoggingIn(true);
    try {
      await login.extension();
      onClose();
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'Extension login failed.');
      setIsLoggingIn(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Please select an image.', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Image too large (max 5MB).', variant: 'destructive' });
      return;
    }

    try {
      const tags = await uploadFile(file);
      const url = tags[0]?.[1];
      if (url) setProfileData((prev) => ({ ...prev, picture: url }));
    } catch {
      toast({ title: 'Upload failed.', variant: 'destructive' });
    }
  };

  const finishSignup = async (skipProfile = false) => {
    try {
      if (!skipProfile && (profileData.name || profileData.about || profileData.picture)) {
        // Defensive guard: only publish kind 0 if the current signer is
        // the freshly generated key. If the auto-switch ever fails (e.g.
        // a regression in useLoginActions), publishing here would sign
        // with the *previous* user's signer and overwrite their kind 0
        // metadata — destroying their profile. Refuse rather than risk
        // it.
        let expectedPubkey: string | null = null;
        try {
          const decoded = nip19.decode(nsec);
          if (decoded.type === 'nsec') {
            expectedPubkey = getPublicKey(decoded.data);
          }
        } catch {
          // fall through to the mismatch branch below
        }

        if (!expectedPubkey || currentUser?.pubkey !== expectedPubkey) {
          toast({
            title: 'Profile not saved',
            description:
              'The new account is not active yet, so your profile was not published (this prevents overwriting another account). Try again from your profile settings.',
            variant: 'destructive',
          });
          return;
        }

        const metadata: Record<string, string> = {};
        if (profileData.name) metadata.name = profileData.name;
        if (profileData.about) metadata.about = profileData.about;
        if (profileData.picture) metadata.picture = profileData.picture;
        await publishEvent({ kind: 0, content: JSON.stringify(metadata) });
      }
    } catch {
      toast({
        title: 'Profile setup failed',
        description: 'Your account was created but the profile could not be saved. You can update it later.',
        variant: 'destructive',
      });
    } finally {
      onClose();
    }
  };

  const getTitle = () => {
    switch (step) {
      case 'welcome':
        return 'Welcome';
      case 'generate':
        return 'Create a Nostr account';
      case 'secure':
        return 'Save your key';
      case 'profile':
        return 'Your profile';
      case 'login':
        return 'Log in';
      case 'connect':
        return 'Connect signer';
    }
  };

  // Decide whether to render the progress view in place of the QR/button.
  // Mobile: flip in as soon as the user taps "Open signer app" (tracked by
  // `hasOpenedSigner`) so they see feedback the moment they return from the
  // signer. Desktop: keep the QR visible through the `awaiting-connect`
  // phase (it's still actionable — they might scan with another device) and
  // only swap in once the signer has acknowledged and we're fetching the
  // pubkey.
  const showProgressView = connectStatus !== null && (
    connectStatus === 'getting-public-key' ||
    (isMobile && hasOpenedSigner)
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-sm max-h-[90dvh] p-0 gap-0 overflow-hidden rounded-2xl overflow-y-auto">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-lg font-semibold leading-none tracking-tight text-center">
            {getTitle()}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6 pt-4 space-y-5">
          {/* Welcome step — the unified entry point. */}
          {step === 'welcome' && (
            <div className="space-y-5 text-center">
              <div className="flex size-32 text-6xl bg-primary/10 rounded-full items-center justify-center mx-auto">
                🔑
              </div>

              <p className="text-sm text-muted-foreground">
                Join with a new Nostr account, or log in with one you already have.
              </p>

              <div className="space-y-2">
                <Button onClick={() => setStep('generate')} className="w-full h-12">
                  Create a new Nostr account
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setStep('login')}
                  className="w-full h-12"
                >
                  Log in to an existing account
                </Button>
              </div>
            </div>
          )}

          {/* Generate step. */}
          {step === 'generate' && (
            <div className="space-y-5 text-center">
              <div className="relative w-20 h-20 mx-auto">
                {isGenerating ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                  </div>
                ) : (
                  <div className="absolute inset-0 rounded-full bg-primary/10 flex items-center justify-center">
                    <Key className="w-8 h-8 text-primary" />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <p className="font-medium">
                  {isGenerating ? 'Creating your key…' : 'Your key is your identity'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isGenerating
                    ? 'This only takes a moment.'
                    : "We'll generate a secret key just for you. Keep it safe — it's the only way to log in."}
                </p>
              </div>

              {!isGenerating && (
                <Button onClick={generateKey} className="w-full h-12">
                  Generate key
                </Button>
              )}

              <button
                onClick={() => setStep('welcome')}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
            </div>
          )}

          {/* Secure step — show + download nsec. */}
          {step === 'secure' && (
            <div className="space-y-4">
              <div className="flex size-14 bg-primary/10 rounded-full items-center justify-center mx-auto">
                <Key className="w-7 h-7 text-primary" />
              </div>

              <p className="text-sm text-muted-foreground text-center">
                Store your key somewhere safe. You'll need it to log in again.
              </p>

              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={nsec}
                  readOnly
                  className="pr-10 font-mono"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>

              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-900 dark:text-amber-300">
                  This key is your only way to access your account. If you lose it, you lose the account.
                </p>
              </div>

              <Button onClick={downloadAndProceed} className="w-full h-12">
                <Download className="w-4 h-4 mr-2" />
                Download &amp; continue
              </Button>
            </div>
          )}

          {/* Profile step — optional metadata. */}
          {step === 'profile' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Tell others a bit about yourself (optional).
              </p>

              <div className={`space-y-4 ${isPublishing ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="space-y-1.5">
                  <label htmlFor="profile-name" className="text-sm font-medium">
                    Display name
                  </label>
                  <Input
                    id="profile-name"
                    value={profileData.name}
                    onChange={(e) =>
                      setProfileData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="Your name"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="profile-about" className="text-sm font-medium">
                    Bio
                  </label>
                  <Textarea
                    id="profile-about"
                    value={profileData.about}
                    onChange={(e) =>
                      setProfileData((prev) => ({ ...prev, about: e.target.value }))
                    }
                    placeholder="A little about you…"
                    className="resize-none"
                    rows={3}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="profile-picture" className="text-sm font-medium">
                    Avatar
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="profile-picture"
                      value={profileData.picture}
                      onChange={(e) =>
                        setProfileData((prev) => ({ ...prev, picture: e.target.value }))
                      }
                      placeholder="https://…"
                      className="flex-1"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={avatarFileInputRef}
                      onChange={handleAvatarUpload}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => avatarFileInputRef.current?.click()}
                      disabled={isUploading}
                      title="Upload avatar"
                    >
                      {isUploading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  onClick={() => finishSignup(false)}
                  disabled={isPublishing}
                  className="w-full h-12"
                >
                  {isPublishing ? 'Saving…' : 'Finish'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => finishSignup(true)}
                  disabled={isPublishing}
                  className="w-full"
                >
                  Skip for now
                </Button>
              </div>
            </div>
          )}

          {/* Login step. */}
          {step === 'login' && (
            <div className="space-y-4">
              {hasExtension ? (
                <>
                  <Button
                    onClick={handleExtensionLogin}
                    disabled={isLoggingIn}
                    className="w-full h-12"
                  >
                    {isLoggingIn ? 'Logging in…' : 'Log in with extension'}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={goToConnect}
                    className="w-full h-12"
                  >
                    Use remote signer
                  </Button>

                  <Collapsible open={showMoreOptions} onOpenChange={setShowMoreOptions}>
                    <CollapsibleTrigger className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground py-2">
                      <span>Use secret key</span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${
                          showMoreOptions ? 'rotate-180' : ''
                        }`}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-3 pt-1">
                      <NsecLoginForm
                        loginNsec={loginNsec}
                        setLoginNsec={setLoginNsec}
                        loginError={loginError}
                        setLoginError={setLoginError}
                        isLoggingIn={isLoggingIn}
                        onSubmit={handleLogin}
                        onFileChange={handleFileUpload}
                        fileInputRef={fileInputRef}
                      />
                    </CollapsibleContent>
                  </Collapsible>
                </>
              ) : (
                <>
                  <NsecLoginForm
                    loginNsec={loginNsec}
                    setLoginNsec={setLoginNsec}
                    loginError={loginError}
                    setLoginError={setLoginError}
                    isLoggingIn={isLoggingIn}
                    onSubmit={handleLogin}
                    onFileChange={handleFileUpload}
                    fileInputRef={fileInputRef}
                  />
                  <Button
                    variant="outline"
                    onClick={goToConnect}
                    className="w-full"
                  >
                    Use remote signer
                  </Button>
                </>
              )}

              <button
                onClick={() => setStep('welcome')}
                className="w-full text-sm text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
            </div>
          )}

          {/* Connect step — nostrconnect QR + bunker URI fallback. */}
          {step === 'connect' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center space-y-4">
                {connectError ? (
                  <div className="flex flex-col items-center space-y-3 py-4">
                    <p className="text-sm text-destructive text-center">{connectError}</p>
                    <Button variant="outline" onClick={handleConnectRetry}>
                      Try again
                    </Button>
                  </div>
                ) : showProgressView ? (
                  // Progress view — replaces the QR/button once the handshake
                  // is under way. Gives the user live feedback through each
                  // phase so a stuck signer is visibly stuck, not silently
                  // stuck.
                  <div className="flex flex-col items-center space-y-4 py-6 w-full">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground text-center min-h-[1.25rem]">
                      {connectStatusLabel(connectStatus)}
                    </p>
                    <button
                      type="button"
                      onClick={handleConnectRetry}
                      className="text-sm text-primary hover:underline underline-offset-4 font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                ) : nostrConnectUri ? (
                  <>
                    {!isMobile && (
                      <div className="p-4 bg-white rounded-xl">
                        <QRCodeCanvas value={nostrConnectUri} size={180} level="M" />
                      </div>
                    )}

                    {isMobile && (
                      <Button onClick={handleOpenSignerApp} className="w-full h-12">
                        <ExternalLink className="w-5 h-5 mr-2" />
                        Open signer app
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-[100px]">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Manual bunker URI fallback. */}
              <Collapsible open={showBunkerInput} onOpenChange={setShowBunkerInput}>
                <CollapsibleTrigger className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground py-2">
                  <span>Enter bunker URI manually</span>
                  {showBunkerInput ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
                  <Input
                    value={bunkerUri}
                    onChange={(e) => setBunkerUri(e.target.value)}
                    placeholder="bunker://…"
                    className="text-base md:text-sm"
                  />
                  {bunkerUri && !validateBunkerUri(bunkerUri) && (
                    <Alert variant="destructive">
                      <AlertDescription>Invalid bunker URI format.</AlertDescription>
                    </Alert>
                  )}
                  <Button
                    variant="outline"
                    onClick={handleBunkerLogin}
                    disabled={
                      isLoggingIn || !bunkerUri.trim() || !validateBunkerUri(bunkerUri)
                    }
                    className="w-full"
                  >
                    {isLoggingIn ? 'Connecting…' : 'Connect'}
                  </Button>
                </CollapsibleContent>
              </Collapsible>

              <button
                onClick={() => setStep('login')}
                className="w-full text-sm text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

/** Shared nsec input + submit + file-upload block used in the login step. */
interface NsecLoginFormProps {
  loginNsec: string;
  setLoginNsec: (v: string) => void;
  loginError: string;
  setLoginError: (v: string) => void;
  isLoggingIn: boolean;
  onSubmit: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

const NsecLoginForm: React.FC<NsecLoginFormProps> = ({
  loginNsec,
  setLoginNsec,
  loginError,
  setLoginError,
  isLoggingIn,
  onSubmit,
  onFileChange,
  fileInputRef,
}) => (
  <form
    onSubmit={(e) => {
      e.preventDefault();
      onSubmit();
    }}
    className="space-y-3"
  >
    <Input
      type="password"
      value={loginNsec}
      onChange={(e) => {
        setLoginNsec(e.target.value);
        if (loginError) setLoginError('');
      }}
      placeholder="nsec1…"
      autoComplete="off"
      className={loginError ? 'border-destructive focus-visible:ring-destructive' : ''}
    />
    {loginError && <p className="text-sm text-destructive">{loginError}</p>}

    <div className="flex gap-2">
      <Button
        type="submit"
        disabled={isLoggingIn || !loginNsec.trim()}
        className="flex-1"
      >
        {isLoggingIn ? 'Logging in…' : 'Log in'}
      </Button>
      <input
        type="file"
        accept=".txt"
        className="hidden"
        ref={fileInputRef}
        onChange={onFileChange}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="w-4 h-4" />
      </Button>
    </div>
  </form>
);

export default AuthDialog;
