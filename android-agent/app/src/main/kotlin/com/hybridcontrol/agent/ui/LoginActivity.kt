package com.hybridcontrol.agent.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.hybridcontrol.agent.HybridControlApp
import com.hybridcontrol.agent.databinding.ActivityLoginBinding
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding
    private var isRegistering = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val authManager = HybridControlApp.instance.authManager
        if (authManager.isLoggedIn) {
            navigateToMain()
            return
        }

        setupUI()
    }

    private fun setupUI() {
        binding.btnLogin.setOnClickListener {
            val email = binding.etEmail.text.toString().trim()
            val password = binding.etPassword.text.toString().trim()

            if (email.isEmpty() || password.isEmpty()) {
                Toast.makeText(this, "Please fill all fields", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            performAuth(email, password)
        }

        binding.tvToggleMode.setOnClickListener {
            isRegistering = !isRegistering
            updateToggleUI()
        }
    }

    private fun updateToggleUI() {
        if (isRegistering) {
            binding.btnLogin.text = "Register"
            binding.tvToggleMode.text = "Already have an account? Login"
            binding.tvTitle.text = "Create Account"
        } else {
            binding.btnLogin.text = "Login"
            binding.tvToggleMode.text = "Don't have an account? Register"
            binding.tvTitle.text = "Login"
        }
    }

    private fun performAuth(email: String, password: String) {
        binding.progressBar.visibility = View.VISIBLE
        binding.btnLogin.isEnabled = false

        lifecycleScope.launch {
            try {
                val authManager = HybridControlApp.instance.authManager
                if (isRegistering) {
                    authManager.register(email, password)
                } else {
                    authManager.login(email, password)
                }
                navigateToMain()
            } catch (e: Exception) {
                Toast.makeText(
                    this@LoginActivity,
                    e.message ?: "Authentication failed",
                    Toast.LENGTH_LONG
                ).show()
            } finally {
                binding.progressBar.visibility = View.GONE
                binding.btnLogin.isEnabled = true
            }
        }
    }

    private fun navigateToMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
