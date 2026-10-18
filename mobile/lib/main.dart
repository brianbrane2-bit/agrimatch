// ============================================================
// SkillLink Mobile App - Worker Registration & Ratings
// ============================================================

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'dart:convert';

// ============================================================
// Configuration
// ============================================================

const String API_BASE = 'http://10.0.2.2:3000';

const List<String> VILLAGES = [
  'Bamenda',
  'Mankon',
  'Nkwen',
  'Bambili',
  'Bambui',
  'Bafut',
  'Bali',
  'Batibo',
  'Mbengwi',
  'Mbouda',
  'Wum',
  'Kumbo',
  'Fundong',
  'Ndop',
  'Nkambe',
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
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}

// ============================================================
// SCREEN 1: Home
// ============================================================

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('SkillLink'),
        backgroundColor: Colors.indigo[700],
        foregroundColor: Colors.white,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.handshake, size: 80, color: Colors.indigo),
              const SizedBox(height: 20),
              const Text(
                'Welcome to SkillLink',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              const Text(
                'Connect skilled workers to clients',
                style: TextStyle(fontSize: 14, color: Colors.grey),
              ),
              const SizedBox(height: 40),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton.icon(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const RegisterScreen()),
                    );
                  },
                  icon: const Icon(Icons.person_add),
                  label: const Text(
                    'Register as Worker',
                    style: TextStyle(fontSize: 16),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: OutlinedButton.icon(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const StatusScreen()),
                    );
                  },
                  icon: const Icon(Icons.search),
                  label: const Text(
                    'Check My Status',
                    style: TextStyle(fontSize: 16),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ============================================================
// SCREEN 2: Register Worker
// ============================================================

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();

  String? _selectedVillage;
  String? _selectedTradeKey;
  List<TradeCategory> _categories = [];
  bool _loadingTrades = true;
  String? _tradeError;

  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _loadTrades();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    super.dispose();
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
      } else {
        if (mounted)
          setState(() {
            _tradeError = 'Failed to load trades';
            _loadingTrades = false;
          });
      }
    } catch (e) {
      if (mounted)
        setState(() {
          _tradeError = 'Network error: $e';
          _loadingTrades = false;
        });
    }
  }

  void _showSnack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedVillage == null || _selectedTradeKey == null) {
      _showSnack('Please select village and trade');
      return;
    }

    setState(() => _submitting = true);

    try {
      final phone = _phoneController.text.trim();
      final response = await http.post(
        Uri.parse('$API_BASE/api/workers'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'phone': phone,
          'name': _nameController.text.trim(),
          'village': _selectedVillage,
          'skill': _selectedTradeKey,
        }),
      );

      if (!mounted) return;

      if (response.statusCode == 201) {
        _showSnack('Registration successful!');
        Navigator.pop(context);
      } else {
        final error =
            jsonDecode(response.body)['error'] ?? 'Registration failed';
        _showSnack(error);
      }
    } catch (e) {
      if (!mounted) return;
      _showSnack('Network error: $e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Register as Worker'),
        backgroundColor: Colors.indigo[700],
        foregroundColor: Colors.white,
      ),
      body: _loadingTrades
          ? const Center(child: CircularProgressIndicator())
          : _tradeError != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Text(
                  _tradeError!,
                  style: const TextStyle(color: Colors.red),
                ),
              ),
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextFormField(
                      controller: _nameController,
                      decoration: const InputDecoration(
                        labelText: 'Full Name',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.person),
                      ),
                      validator: (v) => (v == null || v.trim().isEmpty)
                          ? 'Enter your name'
                          : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _phoneController,
                      decoration: const InputDecoration(
                        labelText: 'Phone Number',
                        hintText: '+2376XXXXXXXX',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.phone),
                      ),
                      keyboardType: TextInputType.phone,
                      validator: (v) => (v == null || v.trim().isEmpty)
                          ? 'Enter your phone'
                          : null,
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      value: _selectedVillage,
                      decoration: const InputDecoration(
                        labelText: 'Village',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.location_on),
                      ),
                      items: VILLAGES
                          .map(
                            (v) => DropdownMenuItem(value: v, child: Text(v)),
                          )
                          .toList(),
                      onChanged: (v) => setState(() => _selectedVillage = v),
                      validator: (v) =>
                          v == null ? 'Select your village' : null,
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      value: _selectedTradeKey,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Trade / Service',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.work),
                      ),
                      items: _buildTradeMenuItems(),
                      onChanged: (v) => setState(() => _selectedTradeKey = v),
                      validator: (v) => v == null ? 'Select your trade' : null,
                    ),
                    const SizedBox(height: 24),
                    SizedBox(
                      height: 50,
                      child: ElevatedButton(
                        onPressed: _submitting ? null : _submit,
                        child: _submitting
                            ? const CircularProgressIndicator(
                                color: Colors.white,
                              )
                            : const Text(
                                'Register',
                                style: TextStyle(fontSize: 16),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  List<DropdownMenuItem<String>> _buildTradeMenuItems() {
    final items = <DropdownMenuItem<String>>[];
    for (final cat in _categories) {
      items.add(
        DropdownMenuItem<String>(
          enabled: false,
          value: '__header_${cat.key}',
          child: Text(
            cat.label,
            style: const TextStyle(
              fontWeight: FontWeight.bold,
              color: Colors.indigo,
            ),
          ),
        ),
      );
      for (final trade in cat.trades) {
        items.add(
          DropdownMenuItem<String>(
            value: trade.key,
            child: Padding(
              padding: const EdgeInsets.only(left: 12),
              child: Text(trade.label),
            ),
          ),
        );
      }
    }
    return items;
  }
}

// ============================================================
// SCREEN 3: Check Status
// ============================================================

class StatusScreen extends StatefulWidget {
  const StatusScreen({super.key});

  @override
  State<StatusScreen> createState() => _StatusScreenState();
}

class _StatusScreenState extends State<StatusScreen> {
  final _phoneController = TextEditingController();
  Map<String, dynamic>? _worker;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _fetchWorker() async {
    final phone = _phoneController.text.trim();
    if (phone.isEmpty) {
      setState(() => _error = 'Please enter a phone number');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
      _worker = null;
    });

    try {
      final encodedPhone = Uri.encodeComponent(phone);
      final response = await http.get(
        Uri.parse('$API_BASE/api/workers/$encodedPhone'),
      );
      if (!mounted) return;

      if (response.statusCode == 200) {
        setState(() => _worker = jsonDecode(response.body));
      } else {
        setState(() => _error = 'Worker not found');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Network error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _showRatingDialog() async {
    if (_worker == null) return;
    final phone = _worker!['phone'] as String;

    int selectedStars = 5;

    final result = await showDialog<int>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('Rate this worker'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('How was your experience?'),
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(5, (index) {
                      final starValue = index + 1;
                      return IconButton(
                        iconSize: 40,
                        icon: Icon(
                          starValue <= selectedStars
                              ? Icons.star
                              : Icons.star_border,
                          color: Colors.amber,
                        ),
                        onPressed: () {
                          setDialogState(() => selectedStars = starValue);
                        },
                      );
                    }),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context, null),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  onPressed: () => Navigator.pop(context, selectedStars),
                  child: const Text('Submit'),
                ),
              ],
            );
          },
        );
      },
    );

    if (result == null) return;

    try {
      final encodedPhone = Uri.encodeComponent(phone);
      final response = await http.post(
        Uri.parse('$API_BASE/api/workers/$encodedPhone/rate'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'rating': result}),
      );

      if (!mounted) return;

      if (response.statusCode == 200) {
        final updated = jsonDecode(response.body)['worker'];
        setState(() => _worker = updated);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Rating submitted: $result star${result > 1 ? 's' : ''}',
            ),
            backgroundColor: Colors.green,
          ),
        );
      } else {
        final error = jsonDecode(response.body)['error'] ?? 'Rating failed';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error), backgroundColor: Colors.red),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Network error: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Check My Status'),
        backgroundColor: Colors.indigo[700],
        foregroundColor: Colors.white,
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _phoneController,
              decoration: const InputDecoration(
                labelText: 'Phone Number',
                hintText: '+2376XXXXXXXX',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.phone),
              ),
              keyboardType: TextInputType.phone,
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 50,
              child: ElevatedButton(
                onPressed: _loading ? null : _fetchWorker,
                child: _loading
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text(
                        'Check Status',
                        style: TextStyle(fontSize: 16),
                      ),
              ),
            ),
            const SizedBox(height: 24),
            if (_error != null)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red[50],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            if (_worker != null) _buildWorkerCard(_worker!),
          ],
        ),
      ),
    );
  }

  Widget _buildWorkerCard(Map<String, dynamic> worker) {
    final rating = worker['rating'] ?? 0;
    final ratingCount = worker['ratingCount'] ?? 0;
    final ratingText = ratingCount > 0
        ? '${rating.toStringAsFixed(1)} ⭐ ($ratingCount review${ratingCount > 1 ? 's' : ''})'
        : 'No ratings yet';

    return Card(
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.person, color: Colors.indigo, size: 32),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    worker['name'] ?? 'Unknown',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const Divider(height: 24),
            _infoRow(Icons.location_on, 'Village', worker['village'] ?? '-'),
            const SizedBox(height: 8),
            _infoRow(Icons.work, 'Trade', _formatTrade(worker['skill'] ?? '-')),
            const SizedBox(height: 8),
            _infoRow(Icons.star, 'Rating', ratingText),
            const SizedBox(height: 8),
            _infoRow(
              Icons.check_circle,
              'Status',
              (worker['available'] == true) ? 'Available' : 'Busy',
            ),
            const Divider(height: 24),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _showRatingDialog,
                icon: const Icon(Icons.star),
                label: const Text('Rate this worker'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.amber[800],
                  side: BorderSide(color: Colors.amber[800]!),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatTrade(String skillKey) {
    if (skillKey.isEmpty) return '-';
    return skillKey
        .split('_')
        .map(
          (part) =>
              part.isEmpty ? '' : part[0].toUpperCase() + part.substring(1),
        )
        .join(' ');
  }

  Widget _infoRow(IconData icon, String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: Colors.grey[700]),
        const SizedBox(width: 12),
        SizedBox(
          width: 80,
          child: Text(
            '$label: ',
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
        Expanded(child: Text(value)),
      ],
    );
  }
}
