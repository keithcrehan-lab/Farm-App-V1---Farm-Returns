package com.getcapacitor.myapp;

import static org.junit.Assert.*;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Instrumented test, which will execute on an Android device.
 *
 * @see <a href="http://d.android.com/tools/testing">Testing documentation</a>
 */
@RunWith(AndroidJUnit4.class)
public class ExampleInstrumentedTest {

    @Test
    public void useAppContext() throws Exception {
        // Context of the app under test.
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();

        // Final Codex audit round 2 (HIGH, Native Mobile / Background
        // GPS Feasibility Phase): Capacitor's own generated template
        // hardcodes its own default sample applicationId here
        // ("com.getcapacitor.app"), not this real app's own real one
        // ("com.farmreturn.spike", capacitor.config.ts/build.gradle) —
        // "the connected Android test suite will fail deterministically."
        assertEquals("com.farmreturn.spike", appContext.getPackageName());
    }
}
