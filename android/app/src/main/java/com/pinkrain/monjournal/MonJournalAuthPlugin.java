package com.pinkrain.monjournal;

import android.app.Activity;
import android.app.PendingIntent;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.GoogleAuthUtil;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Connexion Google pour Android : demande l'accès au dossier caché de l'appli
 * dans Google Drive (drive.appdata) via l'API Identity de Google Play Services,
 * et renvoie un jeton d'accès à la couche web.
 */
@CapacitorPlugin(name = "MonJournalAuth")
public class MonJournalAuthPlugin extends Plugin {

    private static final String DRIVE_APPDATA = "https://www.googleapis.com/auth/drive.appdata";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private ActivityResultLauncher<IntentSenderRequest> consentLauncher;
    private PluginCall pendingCall;

    @Override
    public void load() {
        consentLauncher = getActivity().registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            result -> {
                PluginCall call = pendingCall;
                pendingCall = null;
                if (call == null) {
                    return;
                }
                if (result.getResultCode() != Activity.RESULT_OK) {
                    call.reject("Connexion annulée", "cancelled");
                    return;
                }
                try {
                    AuthorizationResult auth = Identity.getAuthorizationClient(getActivity())
                        .getAuthorizationResultFromIntent(result.getData());
                    resolveWithToken(call, auth);
                } catch (ApiException e) {
                    call.reject(e.getStatusCode() + ": " + e.getMessage(), String.valueOf(e.getStatusCode()), e);
                }
            }
        );
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        final boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", false));
        AuthorizationRequest request = AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_APPDATA)))
            .build();
        Identity.getAuthorizationClient(getActivity())
            .authorize(request)
            .addOnSuccessListener(result -> {
                if (result.hasResolution()) {
                    if (!interactive) {
                        JSObject out = new JSObject();
                        out.put("needsInteraction", true);
                        call.resolve(out);
                        return;
                    }
                    PendingIntent intent = result.getPendingIntent();
                    if (intent == null) {
                        call.reject("Google n'a pas proposé d'écran de connexion");
                        return;
                    }
                    if (pendingCall != null) {
                        pendingCall.reject("Connexion remplacée", "cancelled");
                    }
                    pendingCall = call;
                    consentLauncher.launch(new IntentSenderRequest.Builder(intent.getIntentSender()).build());
                } else {
                    resolveWithToken(call, result);
                }
            })
            .addOnFailureListener(e -> {
                String code = e instanceof ApiException ? String.valueOf(((ApiException) e).getStatusCode()) : "error";
                call.reject(code + ": " + e.getMessage(), code, e);
            });
    }

    private void resolveWithToken(PluginCall call, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null) {
            call.reject("Aucun jeton reçu de Google");
            return;
        }
        JSObject out = new JSObject();
        out.put("accessToken", token);
        call.resolve(out);
    }

    @PluginMethod
    public void clearToken(PluginCall call) {
        final String token = call.getString("token");
        if (token == null) {
            call.resolve();
            return;
        }
        executor.execute(() -> {
            try {
                GoogleAuthUtil.clearToken(getContext(), token);
            } catch (Exception ignored) {
                // Le jeton est peut-être déjà expiré : rien à faire.
            }
            call.resolve();
        });
    }
}
