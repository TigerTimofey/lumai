import { useState } from 'react';
import RegisterForm from './registration/RegisterForm';
import LoginForm from './login/LoginForm';

const AuthPage = () => {
  const [isRegister, setIsRegister] = useState(true);

  return (
    <div>
      <h1>Welcome to Lumai Wellness</h1>
      <div>
        <button onClick={() => setIsRegister(true)}>Register</button>
        <button onClick={() => setIsRegister(false)}>Login</button>
      </div>
      {isRegister ? <RegisterForm /> : <LoginForm />}
    </div>
  );
};

export default AuthPage;