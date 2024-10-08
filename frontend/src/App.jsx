import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { RecoilRoot, useRecoilState, useRecoilValueLoadable } from 'recoil';
import './App.css';
import Login from './components/Login';
import SignUp from './components/Signup';
import Homepage from './components/Homepage';
import Navbar from './components/Navbar';
import FrequentlyAskedQuestions from './components/FAQ';
import Footer from './components/Footer';
import About from './components/About';
import Testimonials from './components/Testimonials';
import Newsletter from './components/Newsletter';
import HowItWorks from './components/Howitworks';
import ScrollToTop from './components/ScrollTop';
import SignIn from './classes/Signin';
import Dashboard from './Dashboard/Dashboard';
import Blog from './components/Blog';
import Content from './classes/Content';
import Register from './classes/Register';
import Header from './Dashboard/Header';
import WelcomePage from './classes/WelcomePage';
import ClassesFooter from './Dashboard/ClassesFooter';
import Profile from './Dashboard/Profile';
import { PrivateRoute, PublicRoute, SubscriptionPrivateRoutes } from './routes'; 
import { userState, fetchUserState,isLoadingState } from "./state/userState";
import Payment from './payment';
import Spinner from './components/spinner';
import TawkTo from './components/Tawkto';
import SubscriptionPrompt from './classes/Subscriptionpage';
import ForgotPassword from './components/forgotpassword';
import ResetPassword from './components/resetpassword';
function App() {
  const location = useLocation();
  const [user, setUser] = useRecoilState(userState);
  const [isLoading, setIsLoading] = useRecoilState(isLoadingState);
  const isDashboardOrProfileRoute = location.pathname.startsWith('/dashboard') || location.pathname === '/profile';  
  const userLoadable = useRecoilValueLoadable(fetchUserState);

  useEffect(() => {
    setIsLoading(true);

    if (userLoadable.state === 'hasValue') {
      setUser(userLoadable.contents); 
      setIsLoading(false); 
    } else if (userLoadable.state === 'hasError') {
      setUser(null);
      setIsLoading(false); 
    }
  }, [userLoadable, setUser, setIsLoading]);

  if (isLoading) {
    return <Spinner />;
  }
  return (
    <div className='w-screen'>
      <TawkTo/>
      {/* Conditionally render Navbar or Header based on the route */}
      {isDashboardOrProfileRoute ? <Header /> : <Navbar />}

      <ScrollToTop />
      <Routes>
        {/* Public Routes */}
        <Route path="/signup" element={<PublicRoute element={SignUp} />} />
        <Route path="/login" element={<PublicRoute element={Login} />} />
        <Route path="/signin" element={<PublicRoute element={SignIn} />} />
        <Route path="/register" element={<PublicRoute element={Register} />} />
        <Route path="/forgotpassword" element={<PublicRoute element={ForgotPassword} />} />
        <Route path="/reset-password/:id" element={<PublicRoute element={ResetPassword} />} />
        
        <Route path="/" element={<Homepage />} />
        <Route path="/faqs" element={<FrequentlyAskedQuestions />} />
        <Route path="/about" element={<About />} />
        <Route path="/testimonials" element={<Testimonials />} />
        <Route path="/subscribe" element={<Newsletter />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/learnchess" element={<Content />} />
        <Route path="/blog" element={<Blog />} />
       <Route path='/prompt/:type' element={<SubscriptionPrompt/>}/>
        {/* Protected Routes wrapped in Route */}
        <Route path="/dashboard" element={<SubscriptionPrivateRoutes element={Dashboard} />} />
        <Route path="/welcome" element={<SubscriptionPrivateRoutes element={WelcomePage} />} />
        <Route path="/profile" element={<SubscriptionPrivateRoutes element={Profile} />} />
        <Route path="/payment/:secret_token/:api_ref/:mode" element={<PublicRoute element={Payment} />} />
      </Routes>

      {isDashboardOrProfileRoute ? <ClassesFooter /> : <Footer />}
    </div>
  );
}

export default function AppWrapper() {
  return (
    <Router>
      <RecoilRoot>
        <App />
      </RecoilRoot>
    </Router>
  );
}
