package com.pinkrain.monjournal;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Mise à jour de l'appli hors Play Store : télécharge le nouvel APK depuis les
 * Releases GitHub de Mon Journal, puis ouvre l'installateur d'Android.
 */
@CapacitorPlugin(name = "MonJournalUpdater")
public class MonJournalUpdaterPlugin extends Plugin {

    private static final String ALLOWED_PREFIX = "https://github.com/Pink-Rain/Mon-Journal/releases/";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        final String url = call.getString("url", "");
        if (!url.startsWith(ALLOWED_PREFIX)) {
            call.reject("Adresse de mise à jour refusée");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settings);
            call.reject("Autorise Mon Journal à installer des applis, puis appuie de nouveau sur « Installer ».", "permission");
            return;
        }
        executor.execute(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) {
                    throw new IllegalStateException("dossier de téléchargement inaccessible");
                }
                File[] old = dir.listFiles();
                if (old != null) {
                    for (File f : old) {
                        f.delete();
                    }
                }
                File apk = new File(dir, "Mon-Journal.apk");
                download(url, apk);
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(uri, "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().runOnUiThread(() -> {
                    getContext().startActivity(install);
                    call.resolve();
                });
            } catch (Exception e) {
                call.reject("Téléchargement impossible : " + e.getMessage(), e);
            }
        });
    }

    private void download(String address, File target) throws Exception {
        HttpURLConnection conn = null;
        boolean ready = false;
        URL url = new URL(address);
        // GitHub redirige vers son stockage : on suit les redirections à la main.
        for (int hops = 0; hops < 6; hops++) {
            conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(60000);
            int status = conn.getResponseCode();
            if (status >= 300 && status < 400) {
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                url = new URL(url, location);
                continue;
            }
            if (status != 200) {
                throw new IllegalStateException("réponse " + status);
            }
            ready = true;
            break;
        }
        if (!ready) {
            throw new IllegalStateException("trop de redirections");
        }
        long total = conn.getContentLengthLong();
        long done = 0;
        int lastPercent = -1;
        try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(target)) {
            byte[] buffer = new byte[64 * 1024];
            int n;
            while ((n = in.read(buffer)) > 0) {
                out.write(buffer, 0, n);
                done += n;
                if (total > 0) {
                    int percent = (int) (done * 100 / total);
                    if (percent != lastPercent) {
                        lastPercent = percent;
                        JSObject progress = new JSObject();
                        progress.put("percent", percent);
                        notifyListeners("progress", progress);
                    }
                }
            }
        } finally {
            conn.disconnect();
        }
    }
}
