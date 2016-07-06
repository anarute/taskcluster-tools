var React             = require('react');
var bs                = require('react-bootstrap');
var utils             = require('../lib/utils');
var taskcluster       = require('taskcluster-client');
var _                 = require('lodash');
var CodeMirror        = require('react-code-mirror');
var ConfirmAction     = require('../lib/ui/confirmaction');

// temporary until we have an updated taskcluster-client with the new methods in it
var reference        = require('./temp-aws-prov-reference');

require('codemirror/mode/javascript/javascript');
require('../lib/codemirror/json-lint');

/** Encode/decode UserData property of object */
var encodeUserData = (obj) => {
  if (obj && obj.UserData) {
    obj.UserData = new Buffer(JSON.stringify(obj.UserData)).toString('base64');
  }
};
var decodeUserData = (obj) => {
  if (obj && obj.UserData) {
    obj.UserData = JSON.parse(new Buffer(obj.UserData, 'base64').toString());
  }
};

var initialAmiSet ={
  "amis": [{
    "region": "...",
    "hvm": "...",
    "pv": "..."
  }]
};

/** Create amiSet editor/viewer (same thing) */
var AmiSetEditor = React.createClass({
  /** Initialize mixins */
  mixins: [
    utils.createTaskClusterMixin({
      clients: {
        awsProvisioner:       taskcluster.createClient(reference)
      },
      clientOpts: {
        awsProvisioner: {
          baseUrl:      'https://aws-provisioner.taskcluster.net/v1'
        }
      },
      reloadOnProps: ['currentAmiSet']
    })
  ],

  propTypes: {
    // AmiSet to update, null of none
    amiSet:             React.PropTypes.string,
    refreshAmiSetsList: React.PropTypes.func.isRequired,
    selectAmiSet:       React.PropTypes.func.isRequired,
  },

  getDefaultProps() {
    return {
      currentAmiSet:  ''     // '' implies. "Create AMI Set"
    };
  },

  getInitialState() {

    return {
      // Loading amiSet or loaded amiSet
      amiSetLoaded: false,
      amiSetError:  undefined,
      amiSet: '',
      amis: initialAmiSet,

      // Edit or viewing current state
      editing:          true,

      // Operation details, if currently doing anything
      working:          false,
      error:            null,
      showAmiSet:       false
    };
  },

  /** Load initial state */
  load() {
    // If there is no currentAmiSet, we're creating a new AMI Set
    if (this.props.currentAmiSet === '') {
      return {
        amiSet:           '',
        amis:             initialAmiSet,
        editing:          true,
        working:          false,
        error:            null
      };
    } else {
      // Load currentAmiSet

      //var amisObject = this.awsProvisioner.amiSet(this.props.currentAmiSet);
      return {
        amiSet:           this.props.currentAmiSet,
        amis:             this.awsProvisioner.amiSet(this.props.currentAmiSet),
        editing:          false,
        working:          false,
        error:            null,
        showAmiSet:       false
      };
    }
  },

  render() {

    let isEditing = this.state.editing;
    let isCreating = isEditing && !this.props.currentAmiSet;

    return (
      <span>
        {
          this.props.currentAmiSet ? (
            <div>
              <h3>Update <code>{this.props.currentAmiSet}</code></h3>
              {
                isEditing ?(
                  <div>
                      {this.renderCodeEditor()}
                      <br/>
                      {this.renderEditingToolbar()}
                    </div>
                  ) : (
                  <span>
                    <pre>{ JSON.stringify(_.pick(this.state.amis, ['amis']), null, 2) }</pre>
                    <bs.ButtonToolbar>
                      <bs.Button bsStyle="success"
                        onClick={this.startEditing}>
                        <bs.Glyphicon glyph="pencil"/>&nbsp;Edit AMI Set
                      </bs.Button>
                    </bs.ButtonToolbar>
                  </span>
                )
              }
            </div>
          ) : (
            <div>
            <bs.Input
              type='text'
              value={this.state.amiSet}
              placeholder="amiSet"
              label='AmiSet'
              hasFeedback
              ref='amiSet'
              onChange={this.amiSetChange}/>
            {this.renderCodeEditor()}
            <br/>
            <bs.ButtonToolbar>
              <ConfirmAction
                buttonStyle='primary'
                glyph='ok'
                label={this.props.amiSet ? 'Update AmiSet' : 'Create AmiSet'}
                action={this.props.amiSet ? this.save : this.create}
                success='Saved AMI Set'>
                Are you sure that you would like to&nbsp;
                {this.props.amiSet ? 'update' : 'create'}
                &nbsp;the <code>{this.state.amiSet}</code> amiSet?
              </ConfirmAction>
            </bs.ButtonToolbar>
            </div>
          )
        }
      </span>
    );
  },

  /** Render editing toolbar */
  renderCodeEditor() {
    return (
      <CodeMirror
        ref="amis"
        lineNumbers={true}
        mode="application/json"
        textAreaClassName={'form-control'}
        textAreaStyle={{minHeight: '20em'}}
        value={JSON.stringify(_.pick(this.state.amis, ['amis']), null, 2)}
        onChange={this.onAmiSetChange}
        indentWithTabs={true}
        tabSize={2}
        lint={true}
        gutters={["CodeMirror-lint-markers"]}
        theme="ambiance"/>
    );
  },

  /** Render editing toolbar */
  renderEditingToolbar() {
    return (
      <bs.ButtonToolbar>
        <bs.Button bsStyle="success"
                   onClick={this.saveAmiSet}
                   disabled={this.state.working}>
          <bs.Glyphicon glyph="ok"/>&nbsp;Save Changes
        </bs.Button>
        <ConfirmAction
          buttonStyle='danger'
          glyph='trash'
          disabled={this.state.working}
          label="Delete AMI Set"
          action={this.deleteAmiSet}
          success="AMI Set deleted">
          Are you sure you want to delete AMI Set &nbsp;
          <code>{this.state.amiSet}</code>?
        </ConfirmAction>
      </bs.ButtonToolbar>
    );
  },

  startEditing() {
    this.setState({editing: true});
  },

  onAmiSetChange(e) {
    this.setState({amis: JSON.parse(e.target.value)});
  },

  amiSetChange() {
    this.setState({
      amiSet: this.refs.amiSet.getValue()
    });
  },

  async saveAmiSet() {
    try {
      await this.awsProvisioner.updateAmiSet(this.state.amiSet, this.state.amis);
      this.setState({
        editing: false,
        error:   null
      });
    } catch(err) {
      this.setState({error: err});
    }
  },

  async create() {
    try {
      await this.awsProvisioner.createAmiSet(this.state.amiSet, this.state.amis);
      this.setState({
        editing: false,
        error:   null
      });
      this.props.selectAmiSet(this.state.amiSet);
      this.props.refreshAmiSetsList();
    } catch(err) {
    this.setState({error: err});
    }
  },

  async deleteAmiSet() {
    await this.awsProvisioner.removeAmiSet(this.state.amiSet);
    this.props.selectAmiSet(undefined);
    this.props.refreshAmiSetsList();
  }

});

// Export AmiSetEditor
module.exports = AmiSetEditor;
