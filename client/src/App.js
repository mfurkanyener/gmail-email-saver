import React, {Component} from 'react'
import firebase from 'firebase'

import './App.css'

const GET = new Headers({
    "Content-Type": "application/json",
    Accept: "application/json"
});

var firebaseConfig = {}; //firebase config

class App extends Component {
    state = {
        data: [],
        emails:{}
    }
    handleChange = name => event => {
        this.setState({
            [name]: event.target.value,
        });
    };

    constructor(props) {
        super(props);

        this.getAuthUrl = this.getAuthUrl.bind(this);
        this.onAuthClick = this.onAuthClick.bind(this);
        this.runFirebaseHandlers = this.runFirebaseHandlers.bind(this);
    }

    componentDidMount() {
        firebase.initializeApp(firebaseConfig);
        this.runFirebaseHandlers()
        firebase.database().ref('/emails').once('value', (response) => {

            this.setState({emails: response.val()})
        })

        if (window.location.href.includes('?code=')) {
            let token = window.location.href.split('?code=')[1].split('&scope')[0]

            this.setState({token})
            this.getEmailsData(token)
            this.getAuthUrl()

        } else {
            this.getAuthUrl()
        }
    }

    runFirebaseHandlers() {
        firebase.database().ref('/emails').on('value', (response) => {

            this.setState({emails: response.val()})
        })
    }

    getAuthUrl() {
        fetch("/getAuthUrl", {
            headers: GET,

        }).then((response) => {
            console.log(response)
            return response.json()
        }).then((data) => {
            this.setState({url: data.url})
        })
    }

    getEmailsData(token) {
        const URL = `/getAllEmails/${encodeURIComponent(token)}`

        fetch(URL, {
            headers: GET,
        }).then((response) => {
            return response.json()
        }).then((data) => {
            this.setState({data})
            console.log(':data', data)
            if (data.res) {
                this.setState({token: null})
            }
        })
    }

    onAuthClick() {
        window.location.assign(this.state.url)
    }

    render() {
        return (
            <form noValidate autoComplete="off" style={{padding: 50}}>

                <h2>
                    Add all of emails to database
                </h2>
                <button
                    onClick={this.onAuthClick}
                    disabled={this.state.token && true}>
                    {this.state.token ? 'adding to database...' : 'Auth'}
                </button>

                <table>
                    {
                        this.state.emails && Object.keys(this.state.emails).map((emailKey,index) => {
                            return (
                                <tr key={index}>
                                    <td>{this.state.emails[emailKey].emailAddress}</td>
                                    <td>{this.state.emails[emailKey].progress}</td>
                                </tr>
                        )
                        })
                        }
                </table>
            </form>
        );
    }
}

export default App;
