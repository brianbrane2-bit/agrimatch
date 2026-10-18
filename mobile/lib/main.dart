// ============================================================
// SkillLink Mobile App - Version 2 (Role-Based)
// ============================================================

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

// ============================================================
// Configuration
// ============================================================

const String API_BASE = 'http://10.0.2.2:3000';

const List<String> VILLAGES = [
  'Bamenda', 'Mankon', 'Nkwen', 'Bambili', 'Bambui',
  'Bafut', 'Bali', 'Batibo', 'Mbengwi', 'Mbouda',
  'Wum', 'Kumbo', 'Fundong', 'Ndop', 'Nkambe',
];

class Trade {
  final String key;
  final String label;
  Trade(this.key, this.label);
}

class TradeCategory {
  final String key;
  final String label;
  final List<Trade> trades;
  TradeCategory(this.key, this.label, this.trades);
}

class User {
  final String phone;
  final String name;
  final String role; // 'worker' or 'client'
  final String? village;
  final String? skill;
  final bool available;
  final double rating;
  final int ratingCount;

  User({
    required this.phone,
    required this.name,
    required this.role,
    this.village,
    this.skill,
    required this.available,
    required this.rating,
    required this.ratingCount,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      phone: json['phone'],
      name: json['name'],
      role: json['role'],
      village: json['village'],
      skill: json['skill'],
      available: json['available'] == true,
      rating: (json['rating'] ?? 0).toDouble(),
      ratingCount: json['ratingCount'] ?? 0,
    );
  }
}

// ============================================================
// Main App
// ============================================================

void main() {
  runApp(const SkillLinkApp());
}

class SkillLinkApp extends StatelessWidget {
  const SkillLinkApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SkillLink',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
        useMaterial3: true,
        pageTransitionsTheme: const PageTransitionsTheme(
          builders: {
            TargetPlatform.android: ZoomPageTransitionsBuilder(),
            TargetPlatform.iOS: ZoomPageTransitionsBuilder(),
          },
        ),
      ),
      home: const AuthScreen(),
    );
  }
}

// ============================================================
// AUTH SCREEN (Login / Register Switch)
// ============================================================

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool _isLogin = true; // Toggle between Login and Register

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('SkillLink'),
        backgroundColor: Colors.indigo[700],
        foregroundColor: Colors.white,
      ),
      body: _isLogin
          ? LoginScreen(onToggle: () => setState(() => _isLogin = false))
          : RegisterScreen(onToggle: () => setState(() => _isLogin = true)),
    );
  }
}

// ============================================================
// LOGIN SCREEN
// ============================================================

class LoginScreen extends StatefulWidget {
  final VoidCallback onToggle;
  const LoginScreen({super.key, required this.onToggle});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phoneController = TextEditingController();
  final _pinController = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _login() async {
    final phone = _phoneController.text.trim();
    final pin = _pinController.text.trim();

    if (phone.isEmpty || pin.isEmpty) {
      setState(() => _error = 'Enter phone and PIN');
      return;
    }

    setState(() { _loading = true; _error = null; });

    try {
      final response = await http.post(
        Uri.parse('$API_BASE/api/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'phone': phone, 'pin': pin}),
      );

      if (!mounted) return;

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final user = User.fromJson(data['user']);
        
        // Route based on role
        if (user.role == 'worker') {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (_) => WorkerDashboard(user: user)),
          );
        } else {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (_) => ClientDashboard(user: user)),
          );
        }
      } else {
        setState(() => _error = 'Invalid phone or PIN');
      }
    } catch (e) {
      setState(() => _error = 'Network error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 40),
          const Icon(Icons.handshake, size: 80, color: Colors.indigo),
          const SizedBox(height: 20),
          const Text(
            'Welcome Back',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 40),
          TextField(
            controller: _phoneController,
            decoration: const InputDecoration(
              labelText: 'Phone Number',
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.phone),
            ),
            keyboardType: TextInputType.phone,
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _pinController,
            decoration: const InputDecoration(
              labelText: '4-Digit PIN',
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.lock),
            ),
            obscureText: true,
            keyboardType: TextInputType.number,
            maxLength: 4,
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            ),
          SizedBox(
            height: 50,
            child: ElevatedButton(
              onPressed: _loading ? null : _login,
              child: _loading
                  ? const CircularProgressIndicator(color: Colors.white)
                  : const Text('Login', style: TextStyle(fontSize: 16)),
            ),
          ),
          const SizedBox(height: 16),
          TextButton(
            onPressed: widget.onToggle,
            child: const Text("Don't have an account? Register"),
          ),
        ],
      ),
    );
  }
}

// ============================================================
// REGISTER SCREEN
// ============================================================

class RegisterScreen extends StatefulWidget {
  final VoidCallback onToggle;
  const RegisterScreen({super.key, required this.onToggle});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _pinController = TextEditingController();

  String _role = 'client'; // Default role
  String? _selectedVillage;
  String? _selectedTradeKey;
  List<TradeCategory> _categories = [];
  bool _loadingTrades = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _loadTrades();
  }

  Future<void> _loadTrades() async {
    try {
      final response = await http.get(Uri.parse('$API_BASE/api/trades'));
      if (response.statusCode == 200) {
        final List<dynamic> data = jsonDecode(response.body);
        final categories = data.map((cat) {
          final trades = (cat['trades'] as List)
              .map((t) => Trade(t['key'], t['label']))
              .toList();
          return TradeCategory(cat['key'], cat['label'], trades);
        }).toList();

        if (mounted) {
          setState(() {
            _categories = categories;
            _loadingTrades = false;
          });
        }
      }
    } catch (e) {
      if (mounted) setState(() => _loadingTrades = false);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_role == 'worker' && (_selectedVillage == null || _selectedTradeKey == null)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select village and trade')));
      return;
    }

    setState(() => _submitting = true);

    try {
      final response = await http.post(
        Uri.parse('$API_BASE/api/register'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'phone': _phoneController.text.trim(),
          'name': _nameController.text.trim(),
          'role': _role,
          'pin': _pinController.text.trim(),
          'village': _role == 'worker' ? _selectedVillage : null,
          'skill': _role == 'worker' ? _selectedTradeKey : null,
        }),
      );

      if (!mounted) return;

      if (response.statusCode == 201) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Registration successful! Please login.'), backgroundColor: Colors.green),
        );
        widget.onToggle(); // Switch back to login
      } else {
        final error = jsonDecode(response.body)['error'] ?? 'Registration failed';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error), backgroundColor: Colors.red));
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Network error: $e')));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24.0),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 20),
            const Text(
              'Create an Account',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 20),
            // Role Selector
            Row(
              children: [
                Expanded(
                  child: ChoiceChip(
                    label: const Text('I need a service', textAlign: TextAlign.center),
                    selected: _role == 'client',
                    onSelected: (v) => setState(() => _role = 'client'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ChoiceChip(
                    label: const Text('I offer services', textAlign: TextAlign.center),
                    selected: _role == 'worker',
                    onSelected: (v) => setState(() => _role = 'worker'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            TextFormField(
              controller: _nameController,
              decoration: const InputDecoration(labelText: 'Full Name', border: OutlineInputBorder(), prefixIcon: Icon(Icons.person)),
              validator: (v) => v!.isEmpty ? 'Required' : null,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _phoneController,
              decoration: const InputDecoration(labelText: 'Phone Number', hintText: '+2376XXXXXXXX', border: OutlineInputBorder(), prefixIcon: Icon(Icons.phone)),
              keyboardType: TextInputType.phone,
              validator: (v) => v!.isEmpty ? 'Required' : null,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _pinController,
              decoration: const InputDecoration(labelText: 'Set 4-Digit PIN', border: OutlineInputBorder(), prefixIcon: Icon(Icons.lock)),
              obscureText: true,
              keyboardType: TextInputType.number,
              maxLength: 4,
              validator: (v) => (v == null || v.length != 4) ? 'Must be 4 digits' : null,
            ),
            // Worker-only fields
            if (_role == 'worker') ...[
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: _selectedVillage,
                decoration: const InputDecoration(labelText: 'Village', border: OutlineInputBorder(), prefixIcon: Icon(Icons.location_on)),
                items: VILLAGES.map((v) => DropdownMenuItem(value: v, child: Text(v))).toList(),
                onChanged: (v) => setState(() => _selectedVillage = v),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                value: _selectedTradeKey,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Trade / Service', border: OutlineInputBorder(), prefixIcon: Icon(Icons.work)),
                items: _categories.expand((cat) => cat.trades.map((t) => DropdownMenuItem(value: t.key, child: Text(t.label)))).toList(),
                onChanged: (v) => setState(() => _selectedTradeKey = v),
              ),
            ],
            const SizedBox(height: 24),
            SizedBox(
              height: 50,
              child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                child: _submitting ? const CircularProgressIndicator(color: Colors.white) : const Text('Register', style: TextStyle(fontSize: 16)),
              ),
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: widget.onToggle,
              child: const Text("Already have an account? Login"),
            ),
          ],
        ),
      ),
    );
  }
}

// ============================================================
// WORKER DASHBOARD
// ============================================================

class WorkerDashboard extends StatelessWidget {
  final User user;
  const WorkerDashboard({super.key, required this.user});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Worker Dashboard'),
        backgroundColor: Colors.indigo[700],
        foregroundColor: Colors.white,
      ),
      body: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('My Profile', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            Card(
              elevation: 4,
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  children: [
                    Row(
                      children: [
                        const CircleAvatar(radius: 30, child: Icon(Icons.person, size: 40)),
                        const SizedBox(width: 16),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(user.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                            Text(user.skill ?? 'No trade set', style: const TextStyle(color: Colors.grey)),
                          ],
                        ),
                      ],
                    ),
                    const Divider(height: 30),
                    _row('Village', user.village ?? '-'),
                    _row('Phone', user.phone),
                    _row('Rating', '${user.rating.toStringAsFixed(1)} ⭐ (${user.ratingCount})'),
                    _row('Status', user.available ? 'Available' : 'Busy'),
                  ],
                ),
              ),
            ),
            const Spacer(),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: OutlinedButton.icon(
                onPressed: () {
                  Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const AuthScreen()));
                },
                icon: const Icon(Icons.logout),
                label: const Text('Logout'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
          Text(value),
        ],
      ),
    );
  }
}

// ============================================================
// CLIENT DASHBOARD (Marketplace)
// ============================================================

class ClientDashboard extends StatefulWidget {
  final User user;
  const ClientDashboard({super.key, required this.user});

  @override
  State<ClientDashboard> createState() => _ClientDashboardState();
}

class _ClientDashboardState extends State<ClientDashboard> {
  List<dynamic> _workers = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _fetchWorkers();
  }

  Future<void> _fetchWorkers() async {
    try {
      final response = await http.get(Uri.parse('$API_BASE/api/workers'));
      if (response.statusCode == 200) {
        if (mounted) {
          setState(() {
            _workers = jsonDecode(response.body);
            _loading = false;
          });
        }
      }
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Hire a Worker'),
        backgroundColor: Colors.indigo[700],
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const AuthScreen())),
          )
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _workers.length,
              itemBuilder: (context, index) {
                final w = _workers[index];
                return Card(
                  elevation: 2,
                  margin: const EdgeInsets.only(bottom: 12),
                  child: ListTile(
                    leading: const CircleAvatar(child: Icon(Icons.person)),
                    title: Text(w['name'], style: const TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: Text('${w['skill']} • ${w['village']}'),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.star, color: Colors.amber, size: 16),
                        Text('${w['rating']}'),
                      ],
                    ),
                  ),
                );
              },
            ),
    );
  }
}